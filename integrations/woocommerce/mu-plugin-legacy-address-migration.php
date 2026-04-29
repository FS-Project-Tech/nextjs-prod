<?php
/**
 * Plugin Name: Joya Legacy Address Safe Migration (MU)
 * Description: Safely migrates legacy indexed Woo address meta into normalized secondary addresses (idempotent, additive).
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Parse existing secondary addresses from user meta.
 *
 * @return array<int, array<string, mixed>>
 */
function joya_get_existing_secondary_addresses(int $user_id): array
{
    $raw = get_user_meta($user_id, 'secondary_addresses', true);

    if (is_array($raw)) {
        return array_values(array_filter($raw, static function ($row): bool {
            return is_array($row);
        }));
    }

    if (is_string($raw)) {
        $trimmed = trim($raw);
        if ($trimmed === '') {
            return [];
        }

        $json = json_decode($trimmed, true);
        if (is_array($json)) {
            return array_values(array_filter($json, static function ($row): bool {
                return is_array($row);
            }));
        }

        if (is_serialized($trimmed)) {
            $unserialized = @maybe_unserialize($trimmed);
            if (is_array($unserialized)) {
                return array_values(array_filter($unserialized, static function ($row): bool {
                    return is_array($row);
                }));
            }
        }
    }

    return [];
}

function joya_addr_str($value): string
{
    return trim((string) ($value ?? ''));
}

function joya_legacy_addr_fingerprint(array $addr): string
{
    $type = joya_addr_str($addr['type'] ?? 'billing');
    if ($type !== 'shipping') {
        $type = 'billing';
    }

    $address1 = strtolower(joya_addr_str($addr['address_1'] ?? ''));
    $postcode = strtolower(joya_addr_str($addr['postcode'] ?? ''));
    $firstName = strtolower(joya_addr_str($addr['first_name'] ?? ''));

    return $type . '|' . $address1 . '|' . $postcode . '|' . $firstName;
}

/**
 * Build normalized address row from legacy bucket.
 *
 * @param array<string, mixed> $bucket
 * @return array<string, mixed>|null
 */
function joya_build_normalized_legacy_address(string $type, string $index, array $bucket): ?array
{
    $t = $type === 'shipping' ? 'shipping' : 'billing';
    $address1 = joya_addr_str($bucket['address_1'] ?? '');
    $postcode = joya_addr_str($bucket['postcode'] ?? '');
    $firstName = joya_addr_str($bucket['first_name'] ?? '');

    if ($address1 === '' && $postcode === '' && $firstName === '') {
        return null;
    }

    $id = 'legacy-' . $t . '-' . $index . '-' . md5($address1 . $postcode);
    $nickname = joya_addr_str($bucket['address_nickname'] ?? '');
    $label = $nickname !== '' ? $nickname : sprintf('Legacy %s #%s', ucfirst($t), $index);

    return [
        'id' => $id,
        'type' => $t,
        'label' => $label,
        'first_name' => $firstName,
        'last_name' => joya_addr_str($bucket['last_name'] ?? ''),
        'company' => joya_addr_str($bucket['company'] ?? ''),
        'address_1' => $address1,
        'address_2' => joya_addr_str($bucket['address_2'] ?? ''),
        'city' => joya_addr_str($bucket['city'] ?? ''),
        'state' => joya_addr_str($bucket['state'] ?? ''),
        'postcode' => $postcode,
        'country' => joya_addr_str($bucket['country'] ?? 'AU'),
        'email' => joya_addr_str($bucket['email'] ?? ''),
        'phone' => joya_addr_str($bucket['phone'] ?? ''),
    ];
}

/**
 * Extract legacy keyed addresses from raw user meta.
 *
 * Expected legacy keys:
 * - shipping_first_name_1
 * - shipping_address_1_1
 * - billing_city_2
 * etc.
 *
 * @return array<int, array<string, mixed>>
 */
function joya_extract_legacy_addresses_from_meta(int $user_id): array
{
    $allMeta = get_user_meta($user_id);
    if (!is_array($allMeta) || $allMeta === []) {
        return [];
    }

    /** @var array<string, array<string, array<string, mixed>>> $grouped */
    $grouped = [
        'billing' => [],
        'shipping' => [],
    ];

    foreach ($allMeta as $metaKey => $metaVals) {
        $key = (string) ($metaKey ?? '');
        if ($key === '') {
            continue;
        }

        $type = '';
        $fieldRaw = '';
        $idx = '';

        // Pattern A (requested originally): billing_first_name_2, shipping_city_1
        if (preg_match('/^(shipping|billing)_(.+)_([0-9]+)$/', $key, $mA)) {
            $type = $mA[1] ?? '';
            $fieldRaw = $mA[2] ?? '';
            $idx = $mA[3] ?? '';
        }
        // Pattern B (actual legacy in your DB): billing2_first_name, shipping11_address_1
        elseif (preg_match('/^(shipping|billing)([0-9]+)_(.+)$/', $key, $mB)) {
            $type = $mB[1] ?? '';
            $idx = $mB[2] ?? '';
            $fieldRaw = $mB[3] ?? '';
        } else {
            continue;
        }

        if ($idx === '') {
            continue;
        }

        $valueRaw = '';
        if (is_array($metaVals)) {
            $valueRaw = (string) ($metaVals[0] ?? '');
        } else {
            $valueRaw = (string) $metaVals;
        }

        $field = $fieldRaw;
        $known = [
            'first_name', 'last_name', 'company',
            'address_1', 'address_2',
            'city', 'state', 'postcode', 'country',
            'email', 'phone',
            'address_nickname',
        ];
        if (!in_array($field, $known, true)) {
            continue;
        }

        if (!isset($grouped[$type][$idx])) {
            $grouped[$type][$idx] = [];
        }
        $grouped[$type][$idx][$field] = $valueRaw;
    }

    $out = [];
    foreach (['billing', 'shipping'] as $type) {
        foreach ($grouped[$type] as $idx => $bucket) {
            $row = joya_build_normalized_legacy_address($type, (string) $idx, $bucket);
            if ($row !== null) {
                $out[] = $row;
            }
        }
    }

    return $out;
}

/**
 * SAFE, IDEMPOTENT per-user migration.
 *
 * - Always dedupes against existing + prior migrated rows
 * - Never overwrites existing rows
 * - Never deletes legacy data
 * - Sets `_legacy_address_migrated = 1` as informational flag only
 *
 * @return array{migrated:int, skipped:int, total_legacy:int}
 */
function migrate_legacy_addresses_safe(int $user_id): array
{
    $existing = joya_get_existing_secondary_addresses($user_id);
    $legacy = joya_extract_legacy_addresses_from_meta($user_id);

    $seen = [];
    foreach ($existing as $row) {
        if (!is_array($row)) {
            continue;
        }
        $seen[joya_legacy_addr_fingerprint($row)] = true;
    }

    $migrated = 0;
    $skipped = 0;
    $toAppend = [];

    foreach ($legacy as $row) {
        $fp = joya_legacy_addr_fingerprint($row);
        if (isset($seen[$fp])) {
            $skipped++;
            continue;
        }
        $seen[$fp] = true;
        $toAppend[] = $row;
        $migrated++;
    }

    if ($migrated > 0) {
        $merged = array_merge($existing, $toAppend);
        update_user_meta($user_id, 'secondary_addresses', $merged);
    }

    // Informational marker only. Dedup still runs every time.
    update_user_meta($user_id, '_legacy_address_migrated', 1);

    return [
        'migrated' => $migrated,
        'skipped' => $skipped,
        'total_legacy' => count($legacy),
    ];
}

/**
 * Bulk safe migration for all users.
 *
 * @return array{users:int, migrated:int, skipped:int, legacy_rows:int}
 */
function run_safe_address_migration(): array
{
    $users = get_users([
        'fields' => 'ID',
    ]);

    $totalUsers = 0;
    $migrated = 0;
    $skipped = 0;
    $legacyRows = 0;

    foreach ($users as $uidRaw) {
        $uid = (int) $uidRaw;
        if ($uid <= 0) {
            continue;
        }
        $totalUsers++;
        $res = migrate_legacy_addresses_safe($uid);
        $migrated += (int) ($res['migrated'] ?? 0);
        $skipped += (int) ($res['skipped'] ?? 0);
        $legacyRows += (int) ($res['total_legacy'] ?? 0);

        error_log(
            sprintf(
                '[legacy-address-migration] User %d: migrated %d addresses, skipped %d duplicates',
                $uid,
                (int) ($res['migrated'] ?? 0),
                (int) ($res['skipped'] ?? 0)
            )
        );
    }

    error_log(
        sprintf(
            '[legacy-address-migration] Completed users=%d legacy_rows=%d migrated=%d skipped=%d',
            $totalUsers,
            $legacyRows,
            $migrated,
            $skipped
        )
    );

    return [
        'users' => $totalUsers,
        'migrated' => $migrated,
        'skipped' => $skipped,
        'legacy_rows' => $legacyRows,
    ];
}

if (defined('WP_CLI') && WP_CLI) {
    /**
     * Usage:
     *   wp migrate:addresses
     */
    WP_CLI::add_command('migrate:addresses', static function () {
        $summary = run_safe_address_migration();
        WP_CLI::success(
            sprintf(
                'Completed users=%d legacy_rows=%d migrated=%d skipped=%d',
                (int) ($summary['users'] ?? 0),
                (int) ($summary['legacy_rows'] ?? 0),
                (int) ($summary['migrated'] ?? 0),
                (int) ($summary['skipped'] ?? 0)
            )
        );
    });
}

