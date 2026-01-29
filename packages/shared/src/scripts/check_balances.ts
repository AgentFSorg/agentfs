/**
 * Balance Check Cron
 *
 * Periodically scans all wallet-connected tenants and verifies
 * their $AOS token holdings. Adjusts tier accordingly.
 *
 * Run via: tsx src/scripts/check_balances.ts
 * Schedule via cron: every 15-30 minutes
 */

import { makeSql } from "../db/client.js";
import { Connection, PublicKey } from "@solana/web3.js";

// Replace with actual $AOS mint address after token launch
const AOS_MINT = process.env.AOS_MINT_ADDRESS || "YOUR_AOS_MINT_ADDRESS_HERE";
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

function tierFromBalance(balance: number): string {
  if (balance >= 100_000) return "unlimited";
  if (balance >= 10_000) return "pro";
  return "free";
}

async function main() {
  const sql = makeSql();
  const connection = new Connection(RPC_URL, "confirmed");
  const mintPubkey = new PublicKey(AOS_MINT);

  try {
    // Get all wallet-connected tenants
    const tenants = await sql`
      SELECT id, wallet_address, token_balance, tier, tier_downgrade_warning_at
      FROM tenants
      WHERE wallet_address IS NOT NULL
      ORDER BY last_balance_check ASC NULLS FIRST
      LIMIT 500
    `;

    console.log(`Checking ${tenants.length} wallets...`);

    let updated = 0;
    let downgraded = 0;
    let upgraded = 0;

    for (const tenant of tenants) {
      try {
        const walletPubkey = new PublicKey(tenant.wallet_address);

        // Get token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          walletPubkey,
          { mint: mintPubkey }
        );

        let balance = 0;
        for (const account of tokenAccounts.value) {
          const parsed = account.account.data.parsed;
          balance += parsed.info.tokenAmount.uiAmount || 0;
        }

        const newTier = tierFromBalance(balance);
        const oldTier = tenant.tier;

        // Update balance
        await sql`
          UPDATE tenants
          SET token_balance = ${Math.floor(balance)},
              last_balance_check = now()
          WHERE id = ${tenant.id}::uuid
        `;
        updated++;

        // Handle tier changes
        if (newTier !== oldTier) {
          if (
            // Downgrade: check grace period
            (oldTier === "unlimited" && newTier !== "unlimited") ||
            (oldTier === "pro" && newTier === "free")
          ) {
            if (!tenant.tier_downgrade_warning_at) {
              // Start grace period
              await sql`
                UPDATE tenants
                SET tier_downgrade_warning_at = now()
                WHERE id = ${tenant.id}::uuid
              `;
              console.log(
                `⚠️  Grace period started for ${tenant.wallet_address.slice(0, 8)}... (${oldTier} → ${newTier})`
              );
            } else {
              const warningTime = new Date(
                tenant.tier_downgrade_warning_at
              ).getTime();
              if (Date.now() - warningTime > GRACE_PERIOD_MS) {
                // Grace period expired — downgrade
                await sql`
                  UPDATE tenants
                  SET tier = ${newTier}, tier_downgrade_warning_at = NULL
                  WHERE id = ${tenant.id}::uuid
                `;
                await sql`
                  INSERT INTO tier_history (tenant_id, old_tier, new_tier, token_balance, reason)
                  VALUES (${tenant.id}::uuid, ${oldTier}, ${newTier}, ${Math.floor(balance)}, 'balance_check_downgrade')
                `;
                downgraded++;
                console.log(
                  `⬇️  Downgraded ${tenant.wallet_address.slice(0, 8)}... (${oldTier} → ${newTier})`
                );
              } else {
                console.log(
                  `⏳ Grace period active for ${tenant.wallet_address.slice(0, 8)}... (${Math.round((GRACE_PERIOD_MS - (Date.now() - warningTime)) / 3600000)}h remaining)`
                );
              }
            }
          } else {
            // Upgrade: apply immediately
            await sql`
              UPDATE tenants
              SET tier = ${newTier}, tier_downgrade_warning_at = NULL
              WHERE id = ${tenant.id}::uuid
            `;
            await sql`
              INSERT INTO tier_history (tenant_id, old_tier, new_tier, token_balance, reason)
              VALUES (${tenant.id}::uuid, ${oldTier}, ${newTier}, ${Math.floor(balance)}, 'balance_check_upgrade')
            `;
            upgraded++;
            console.log(
              `⬆️  Upgraded ${tenant.wallet_address.slice(0, 8)}... (${oldTier} → ${newTier})`
            );
          }
        } else if (tenant.tier_downgrade_warning_at) {
          // Balance recovered during grace period — clear warning
          await sql`
            UPDATE tenants
            SET tier_downgrade_warning_at = NULL
            WHERE id = ${tenant.id}::uuid
          `;
          console.log(
            `✅ Grace period cleared for ${tenant.wallet_address.slice(0, 8)}... (balance recovered)`
          );
        }

        // Small delay to avoid RPC rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.error(
          `Error checking ${tenant.wallet_address?.slice(0, 8)}...:`,
          (err as Error).message
        );
      }
    }

    console.log(
      `\nDone. Checked: ${updated}, Upgraded: ${upgraded}, Downgraded: ${downgraded}`
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
