# WordPress Secondary Addresses – Update for Your Server

Use the two files below on your server. **Do not change file locations** – only replace/update the content.

---

## 1. REST API file (NDIS/HCP storage)

**Server path:**  
`/applications/avvxsaxstm/public_html/wp-content/themes/bootscore-child/wordpress-secondary-addresses-rest-api.php`

**What to do:**  
Replace the entire file content with the content of:

**In this repo:**  
`docs/wordpress-secondary-addresses-rest-api.php`

**Changes in this file:**
- `$billing2_keys` and `$shipping2_keys` now include NDIS/HCP:  
  `ndis_participant_name`, `ndis_number`, `ndis_dob`, `ndis_funding_type`, `ndis_approval`, `ndis_invoice_email`,  
  `hcp_participant_name`, `hcp_number`, `hcp_provider_email`, `hcp_approval`
- `save_secondary_address_to_meta()` saves booleans as `'1'`/`'0'` so approval checkboxes persist

---

## 2. Functions file (admin form + save)

**Server path:**  
`/applications/avvxsaxstm/public_html/wp-content/themes/bootscore-child/functions.php`

**What to do:**  
Replace only your **secondary-addresses block** (the part from `// Add Duplicate Billing & Shipping Sections` through `require_once ... wordpress-secondary-addresses-rest-api.php`) with the content of:

**In this repo:**  
`docs/wordpress-functions-secondary-addresses.php`

**Changes in this file:**
- Billing (Secondary): added Address Line 2, State, Country; added full NDIS section (Participant Name, Number, DOB, Funding Type, Invoice Email, Approval); added full HCP section (Participant Name, Number, Provider Email, Approval)
- Shipping (Secondary): added Address Line 2, State, Country, Phone, Email
- `save_secondary_addresses()` saves all of the above; checkboxes (NDIS Approval, HCP Approval) are saved as `'1'` or `'0'`

---

## Summary

| Server file | Repo source | Action |
|-------------|-------------|--------|
| `.../bootscore-child/wordpress-secondary-addresses-rest-api.php` | `docs/wordpress-secondary-addresses-rest-api.php` | Replace whole file |
| `.../bootscore-child/functions.php` | `docs/wordpress-functions-secondary-addresses.php` | Replace only the secondary-addresses block |

After updating both, NDIS and HCP data from the dashboard “Add address” / “Edit address” form will be stored in the WordPress database and will show when you open the address again.
