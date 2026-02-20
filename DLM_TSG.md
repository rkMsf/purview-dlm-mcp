# Microsoft Purview DLM — Troubleshooting Guides (TSGs)

> **Last Updated:** February 20, 2026
> **Scope:** Top 11 DLM escalation scenarios with step-by-step investigation, root cause confirmation, and resolution.

---

## Table of Contents

| TSG # | Title |
|-------|-------|
| 1 | [Retention Policy Not Applying to Workloads](#tsg-1--retention-policy-not-applying-to-workloads) |
| 2 | [Retention Policy Stuck in Error / PendingDeletion](#tsg-2--retention-policy-stuck-in-error--pendingdeletion) |
| 3 | [Items Not Moving from Primary Mailbox to Archive](#tsg-3--items-not-moving-from-primary-mailbox-to-archive) |
| 4 | [Auto-Expanding Archive Not Provisioning Additional Storage](#tsg-4--auto-expanding-archive-not-provisioning-additional-storage) |
| 5 | [Inactive Mailbox Not Created After User Deletion](#tsg-5--inactive-mailbox-not-created-after-user-deletion) |
| 6 | [Items Stuck in SubstrateHolds / Recoverable Items Quota Exceeded](#tsg-6--items-stuck-in-substrateholds--recoverable-items-quota-exceeded) |
| 7 | [Teams Messages Not Being Deleted After Retention Period](#tsg-7--teams-messages-not-being-deleted-after-retention-period) |
| 8 | [SharePoint Site Deletion Blocked by Retention Policy](#tsg-8--sharepoint-site-deletion-blocked-by-retention-policy) |
| 9 | [Auto-Apply Retention Labels Not Labeling Content](#tsg-9--auto-apply-retention-labels-not-labeling-content) |
| 10 | [MRM and Purview Retention Conflict — Unexpected Deletion or Retention](#tsg-10--mrm-and-purview-retention-conflict--unexpected-deletion-or-retention) |
| 11 | [Adaptive Scope Issues — Wrong Members, No Members, or Query Failures](#tsg-11--adaptive-scope-issues--wrong-members-no-members-or-query-failures) |

---

## TSG 1 — Retention Policy Not Applying to Workloads

**Symptom:** Retention policy shows "Distributed" / "Success" in the Purview portal, but target mailboxes, sites, or Teams do not reflect the hold. Content is not being retained or deleted as expected.

### Step 1 — Verify Policy Status and Distribution Detail

```powershell
Connect-IPPSSession

# Check policy status
Get-RetentionCompliancePolicy "<PolicyName>" | FL Name, Guid, Enabled, Mode, DistributionStatus

# Get detailed distribution errors per workload
Get-RetentionCompliancePolicy "<PolicyName>" -DistributionDetail | FL DistributionDetail
```

- ✅ If `DistributionStatus` = **Success** → go to Step 2.
- ❌ If `DistributionStatus` = **Error** or **RetryDistribution** → jump to **TSG 2**.

### Step 2 — Confirm Policy Has a Retention Rule

```powershell
Get-RetentionComplianceRule -Policy "<PolicyName>" | FL Name, RetentionDuration, RetentionComplianceAction, Mode
```

- ❌ If **no rules returned** → the policy has no retention settings. Add a rule:
  ```powershell
  New-RetentionComplianceRule -Name "<RuleName>" -Policy "<PolicyName>" -RetentionDuration 730 -RetentionComplianceAction Keep
  ```
- ✅ If rules exist → go to Step 3.

### Step 3 — Verify the Policy Scope Includes the Target Location

```powershell
# For Exchange workload
Get-RetentionCompliancePolicy "<PolicyName>" | FL ExchangeLocation, ExchangeLocationException

# For SharePoint/OneDrive
Get-RetentionCompliancePolicy "<PolicyName>" | FL SharePointLocation, SharePointLocationException, OneDriveLocation, OneDriveLocationException

# For Teams
Get-RetentionCompliancePolicy "<PolicyName>" | FL TeamsChannelLocation, TeamsChatLocation
```

- ❌ If target user/site/group is not in the location list (or is in an exception list) → update scope.
- ❌ If using **Adaptive Scope**, validate the scope query:
  ```powershell
  Get-AdaptiveScope "<ScopeName>" | FL FilterQuery
  # Test the query
  Get-Recipient -Filter "<same filter from adaptive scope>"
  ```
- ✅ Scope is correct → go to Step 4.

### Step 4 — Verify the Hold Is Stamped on the Target Mailbox (Exchange)

```powershell
Get-Mailbox <user@contoso.com> | FL InPlaceHolds, RetentionPolicy, LitigationHoldEnabled
```

- The policy GUID (prefix `mbx` or `skp`) should appear in `InPlaceHolds`.
- ❌ If the policy GUID is **missing** → Policy Sync failure between Purview and Exchange. Go to Step 5.
- ✅ If GUID is present → go to Step 6.

### Step 5 — Force Policy Redistribution

```powershell
Set-RetentionCompliancePolicy "<PolicyName>" -RetryDistribution
```

- Wait **24–48 hours**, then re-check Step 1 and Step 4.
- ❌ If still not stamped after 48 hours → **Escalate to Microsoft Support** (backend Policy Sync issue, possibly AD duplicate object conflict).

### Step 6 — Check for Propagation Delay

- **Exchange:** Policies can take up to **7 days** to take effect. Mailbox must have **≥10 MB** of content.
- **SharePoint/OneDrive:** Up to **24 hours**.
- **Teams:** Up to **48–72 hours**.

If within the propagation window, wait and re-verify.

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| No retention rule on policy | Policy created without retention settings |
| Target not in scope / in exception list | Misconfigured policy scope |
| Policy GUID missing from `InPlaceHolds` | Policy Sync failure (AD conflict, backend error) |
| Policy GUID present, content unchanged | Normal propagation delay (up to 7 days) |

### Resolution Summary

1. Add missing retention rule.
2. Correct the policy scope / remove from exception list.
3. Run `Set-RetentionCompliancePolicy -RetryDistribution` for sync failures.
4. Wait for propagation window. If still failing after 7 days + retry, escalate.

---

## TSG 2 — Retention Policy Stuck in Error / PendingDeletion

**Symptom:** Policy shows status "Error", "PolicySyncTimeout", or "PendingDeletion" in Purview portal. Cannot edit or delete the policy.

### Step 1 — Identify the Current Policy State

```powershell
Connect-IPPSSession

Get-RetentionCompliancePolicy "<PolicyName>" | FL Name, Guid, DistributionStatus, Enabled, WhenChanged
Get-RetentionCompliancePolicy "<PolicyName>" -DistributionDetail | FL DistributionDetail
```

- Record the `DistributionStatus` and any error messages from `DistributionDetail`.

### Step 2 — Determine the Failure Type

| Status | Meaning | Action |
|--------|---------|--------|
| `Error` | Distribution failed to one or more workloads | Go to Step 3 |
| `PolicySyncTimeout` | Backend timed out syncing to workloads | Go to Step 3 |
| `PendingDeletion` | Policy deletion initiated but backend cleanup incomplete | Go to Step 4 |

### Step 3 — Retry Distribution (Error / PolicySyncTimeout)

```powershell
Set-RetentionCompliancePolicy "<PolicyName>" -RetryDistribution
```

- Wait **24–48 hours**.
- Re-check: `Get-RetentionCompliancePolicy "<PolicyName>" | FL DistributionStatus`
- ✅ If status changes to **Success** → resolved.
- ❌ If still in error → check for **AD duplicate objects**:
  ```powershell
  # In Exchange Online PowerShell
  Get-Recipient <affectedUser@contoso.com> | FL RecipientType, RecipientTypeDetails
  # Look for duplicate objects with same proxy address
  Get-Recipient -Filter "EmailAddresses -eq 'smtp:<address>'" | FL Name, RecipientType, Guid
  ```
- If duplicates found → remove the duplicate object, resync, then retry distribution.
- ❌ If no duplicates and retry fails → **Escalate** (requires backend binding cleanup).

### Step 4 — Force-Delete a Policy Stuck in PendingDeletion

```powershell
Remove-RetentionCompliancePolicy "<PolicyName>" -ForceDeletion
```

- ✅ If command succeeds → verify the policy is gone:
  ```powershell
  Get-RetentionCompliancePolicy "<PolicyName>" -ErrorAction SilentlyContinue
  ```
- ❌ If force-delete fails → **Escalate** (orphaned policy bindings require engineering cleanup).

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| `DistributionDetail` shows datacenter/sync errors | Transient backend failure |
| Duplicate AD/EXO objects with same proxy address | AD conflict blocking distribution |
| `PendingDeletion` persists after force-delete | Orphaned backend policy bindings |

### Resolution Summary

1. Retry distribution and wait 24–48 hours.
2. Remove duplicate AD/EXO objects if found.
3. Use `-ForceDeletion` for stuck PendingDeletion policies.
4. Escalate if retries and force-delete both fail.

---

## TSG 3 — Items Not Moving from Primary Mailbox to Archive

**Symptom:** User's primary mailbox is full or near quota, but items are not moving to the archive mailbox despite MRM/archive policies being in place.

### Step 1 — Verify Archive Mailbox Is Enabled

```powershell
Connect-ExchangeOnline

Get-Mailbox <user@contoso.com> | FL ArchiveStatus, ArchiveGuid, ArchiveName
```

- ❌ If `ArchiveStatus` = **None** → Archive not enabled. Enable it:
  ```powershell
  Enable-Mailbox <user@contoso.com> -Archive
  ```
- ✅ If `ArchiveStatus` = **Active** → go to Step 2.

### Step 2 — Verify a Retention Policy with Archive Tag Is Assigned

```powershell
Get-Mailbox <user@contoso.com> | FL RetentionPolicy

# List the tags in that policy
Get-RetentionPolicy "<PolicyName>" | FL RetentionPolicyTagLinks

# Check for an archive-action tag
Get-RetentionPolicyTag | Where-Object {$_.RetentionAction -eq "MoveToArchive"} | FL Name, Type, AgeLimitForRetention, RetentionEnabled
```

- ❌ If no `RetentionPolicy` assigned → assign one:
  ```powershell
  Set-Mailbox <user@contoso.com> -RetentionPolicy "Default MRM Policy"
  ```
- ❌ If policy has no **MoveToArchive** tag → add a Default Policy Tag (DPT) with archive action.
- ✅ Tags exist → go to Step 3.

### Step 3 — Check If Retention Hold Is Blocking Processing

```powershell
Get-Mailbox <user@contoso.com> | FL RetentionHoldEnabled, ElcProcessingDisabled, StartDateForRetentionHold, EndDateForRetentionHold
```

- ❌ If `RetentionHoldEnabled` = **True** → MRM is paused. Disable if appropriate:
  ```powershell
  Set-Mailbox <user@contoso.com> -RetentionHoldEnabled $false
  ```
- ❌ If `ElcProcessingDisabled` = **True** → MFA is disabled for this mailbox. Enable:
  ```powershell
  Set-Mailbox <user@contoso.com> -ElcProcessingDisabled $false
  ```
- ✅ Both are `$false` → go to Step 4.

### Step 4 — Validate User License (E3/E5 Required)

```powershell
# Check the mailbox plan for Enterprise capability
$plan = Get-MailboxPlan (Get-Mailbox <user@contoso.com>).MailboxPlan
$plan.PersistedCapabilities
# Must contain "BPOS_S_Enterprise" (E3/E5) or "BPOS_S_Archive" / "BPOS_S_ArchiveAddOn"
```

- ❌ If no Enterprise/Archive capability → user doesn't have the required license. Archiving will not work.
- ✅ License valid → go to Step 5.

### Step 5 — Check ELC Processing at Organization Level

```powershell
Get-OrganizationConfig | FL ElcProcessingDisabled
```

- ❌ If `ElcProcessingDisabled = True` → MFA is disabled **org-wide**. No mailboxes will be processed:
  ```powershell
  Set-OrganizationConfig -ElcProcessingDisabled $false
  ```
- ✅ `$false` → go to Step 6.

### Step 6 — Check When ELC Last Ran Successfully & Look for Errors

```powershell
# Get the primary and archive mailbox GUIDs
$mbx = Get-Mailbox <user@contoso.com>
$primaryGuid = $mbx.ExchangeGuid
$archiveGuid = $mbx.ArchiveGuid

# Check ELC last success timestamp on primary
$logs = Export-MailboxDiagnosticLogs <user@contoso.com> -ExtendedProperties
$xmlprops = [xml]($logs.MailboxLog)
$xmlprops.Properties.MailboxTable.Property | Where-Object {$_.Name -eq "ELCLastSuccessTimestamp"} | Select-Object -ExpandProperty Value

# Check ELC last success timestamp on archive
$archiveLogs = Export-MailboxDiagnosticLogs $archiveGuid -ExtendedProperties
$archiveXml = [xml]($archiveLogs.MailboxLog)
$archiveXml.Properties.MailboxTable.Property | Where-Object {$_.Name -eq "ELCLastSuccessTimestamp"} | Select-Object -ExpandProperty Value
```

- ❌ If ELC has **not run in the last 5 days** on either primary or archive → MFA is not processing the mailbox.
- Check for MRM errors:
  ```powershell
  # Export MRM diagnostic logs to look for errors
  (Export-MailboxDiagnosticLogs <user@contoso.com> -ComponentName MRM).MailboxLog
  ```
- ⚠️ Known error: If logs contain `MapiExceptionInvalidRecipients` → indicates corrupted recipient data.

### Step 7 — Check Account & Mailbox Status

```powershell
Get-Mailbox <user@contoso.com> | FL IsShared, AccountDisabled
```

- ❌ If `AccountDisabled = True` AND `IsShared = False` → the disabled account is likely causing MRM/EWS errors. MFA cannot process the mailbox. Re-enable the account or investigate the disabled state.

### Step 8 — Validate Archive Connectivity & MRM Configuration (FAI)

```powershell
# Test archive connectivity and MRM configuration
Test-ArchiveConnectivity <user@contoso.com> -IncludeArchiveMRMConfiguration | Select-Object -ExpandProperty Result
```

- ❌ If result does NOT contain "Successfully" → archive connectivity is broken. Escalate.

**Check for TracingFAI errors (corrupted tags/folders):**

```powershell
$tracingFai = Export-MailboxDiagnosticLogs <user@contoso.com> -ComponentName TracingFai
$tracingFai.MailboxLog | ConvertFrom-Json
# Look for non-zero "Fs" (Failure) entries
# Error codes: 1=DumpsterQuotaTooSmall, 2=RecipientCorrupt, 3=IPMOversizeMessage,
#   4=DumpsterOversizeMessage, 5=TagUnexpectedActionChanged, 6=TooManyTagsAgeLimitChanged,
#   7=TagMultipleContentSettings, 8=CorruptRecipients, 9=CorruptComplianceEntry,
#   10=ResetComplianceEntry, 11=FolderItemCountLimit
```

- ❌ If TracingFAI errors found → indicates corrupted MRM configuration. Fix:
  ```powershell
  # Reset MRM configuration (FAI) and re-trigger MFA
  Set-Mailbox <user@contoso.com> -RemoveMRMConfiguration
  Start-ManagedFolderAssistant <user@contoso.com>
  ```

**Validate MRM Policy Tag consistency:**

```powershell
$config = Test-ArchiveConnectivity <user@contoso.com> -IncludeArchiveMRMConfiguration

# Compare PrimaryMRMConfiguration PolicyTags with assigned RetentionPolicyTagLinks
$policyTags = ([xml]$config.PrimaryMRMConfiguration).UserConfiguration.Info.Data.PolicyTag
$archiveTags = ([xml]$config.PrimaryMRMConfiguration).UserConfiguration.Info.Data.ArchiveTag
$defaultArchiveTags = ([xml]$config.PrimaryMRMConfiguration).UserConfiguration.Info.Data.DefaultArchiveTag

# Show tag details
$policyTags | Format-Table Name, Guid, IsVisible, OptedInto, Type
$archiveTags | Format-Table Name, Guid, IsVisible, OptedInto, Type
$defaultArchiveTags | Format-Table Name, Guid, IsVisible, OptedInto, Type
```

- ❌ If MRMConfiguration tags don't match `RetentionPolicyTagLinks` → FAI is stale/corrupt:
  ```powershell
  Set-Mailbox <user@contoso.com> -RemoveMRMConfiguration
  Start-ManagedFolderAssistant <user@contoso.com>
  ```

### Step 9 — Check for Active MRS Requests Blocking Archiving

```powershell
# Check for active mailbox move/migration requests
Get-MoveRequest <user@contoso.com> -ErrorAction SilentlyContinue | FL Status, PercentComplete
```

- ❌ If an active move request exists with status ≠ Completed → MRS is locking the mailbox. Archiving is blocked until the move completes.

### Step 10 — Manually Trigger MFA and Check for Oversized Items

```powershell
Start-ManagedFolderAssistant <user@contoso.com>
```

- Wait **24–48 hours** for MFA to process the mailbox.
- Re-check archive size:
  ```powershell
  Get-MailboxStatistics <user@contoso.com> -Archive | FL TotalItemSize, ItemCount
  ```

**Check for oversized items** — MRM cannot move items **>150 MB** to the archive:

```powershell
Get-MailboxFolderStatistics <user@contoso.com> | Where-Object {$_.FolderSize -gt "150 MB"} | FL FolderPath, FolderSize, ItemsInFolder
```

- If present, advise the user to manually move oversized items or split them.

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| `ArchiveStatus` = None | Archive mailbox not enabled |
| No MoveToArchive tag in policy | Missing archive retention tag |
| `RetentionHoldEnabled` = True | MRM processing suspended |
| `ElcProcessingDisabled` = True (mailbox or org) | MFA disabled — items won't move |
| No E3/E5 or Archive license | Missing required license |
| ELC not run in >5 days / MRM errors in logs | MFA not processing or encountering errors |
| `AccountDisabled` = True (non-shared mailbox) | Disabled account blocks MRM/EWS |
| Archive connectivity test failed | Broken connection between primary and archive |
| TracingFAI errors (CorruptRecipients, etc.) | Corrupted MRM configuration |
| MRMConfiguration/FAI tags mismatch policy | Stale FAI — needs `RemoveMRMConfiguration` |
| Active MRS move request | Mailbox locked by migration |
| Items > 150 MB present | Oversized items cannot be auto-archived |

### Resolution Summary

1. Enable the archive mailbox.
2. Assign a retention policy with a MoveToArchive DPT.
3. Disable retention hold / re-enable ELC processing (mailbox AND org level).
4. Verify E3/E5 or Archive Add-On license.
5. Check ELC last run timestamps — if stale, trigger MFA manually.
6. Review MRM diagnostic logs for errors (`Export-MailboxDiagnosticLogs -ComponentName MRM`).
7. If `AccountDisabled` = True on a user mailbox, re-enable the account.
8. If archive connectivity fails, escalate.
9. If TracingFAI errors or FAI tag mismatch → run `Set-Mailbox -RemoveMRMConfiguration` then `Start-ManagedFolderAssistant`.
10. Wait for active MRS requests to complete.
11. Address oversized items (>150 MB) manually.

---

## TSG 4 — Auto-Expanding Archive Not Provisioning Additional Storage

**Symptom:** Archive mailbox is near or at its 100 GB quota. Auto-expanding archiving is enabled, but no auxiliary archive is being created and the user is getting quota warnings.

### Step 1 — Confirm Auto-Expanding Archive Is Enabled

```powershell
Connect-ExchangeOnline

# Check org-level
Get-OrganizationConfig | FL AutoExpandingArchiveEnabled

# Check user-level
Get-Mailbox <user@contoso.com> | FL AutoExpandingArchiveEnabled
```

- ❌ If both are **False** → enable it:
  ```powershell
  # Org-level
  Set-OrganizationConfig -AutoExpandingArchive
  # OR user-level
  Enable-Mailbox <user@contoso.com> -AutoExpandingArchive
  ```
- ✅ Enabled → go to Step 2.

### Step 2 — Check if Archive Has Reached the 90 GB Transition Threshold

```powershell
Get-MailboxStatistics <user@contoso.com> -Archive | FL TotalItemSize, TotalDeletedItemSize
Get-Mailbox <user@contoso.com> | FL ArchiveQuota, ArchiveWarningQuota, RecoverableItemsQuota
```

- ❌ If total archive size is **<90 GB** → expansion will not trigger yet. This is by design.
- ✅ If ≥90 GB → go to Step 3.

### Step 3 — Check Mailbox Locations for Existing Auxiliary Archives

```powershell
Get-Mailbox <user@contoso.com> | Select -ExpandProperty MailboxLocations
```

- Look for entries with **AuxArchive** type.
- ✅ If `AuxArchive` entries exist → expansion has occurred. The 30-day ghosted content flush may still be in progress.
- ❌ If no `AuxArchive` → go to Step 4.

### Step 4 — Check if MFA Has Processed the Archive

```powershell
# Trigger MFA on the archive mailbox GUID (from MailboxLocations - MainArchive GUID)
Start-ManagedFolderAssistant <MainArchiveGUID>
```

- MFA must run on the archive for expansion to be evaluated. It runs automatically within 7 days, but you can trigger it manually.
- Wait **24–48 hours** after triggering, then re-check Step 3.

### Step 5 — Check for Litigation Hold Quota Issue

```powershell
Get-Mailbox <user@contoso.com> | FL LitigationHoldEnabled, ArchiveQuota, RecoverableItemsQuota
```

- ❌ If `LitigationHoldEnabled` = True AND `ArchiveQuota` = **100 GB** (not 110 GB) → the quota wasn't bumped. Re-enable:
  ```powershell
  Enable-Mailbox <user@contoso.com> -AutoExpandingArchive
  # This bumps ArchiveQuota and RecoverableItemsQuota to 110 GB
  ```

### Step 6 — Check Archive Growth Rate

- Auto-expanding archiving supports a **maximum growth rate of 1 GB/day**.
- ❌ If the mailbox is ingesting >1 GB/day (journaling, transport rules, auto-forwarding) → Microsoft may deny additional archiving.

### Step 7 — Verify ELC Last Ran Successfully on Archive

```powershell
# Get archive GUID
$mbx = Get-Mailbox <user@contoso.com>
$archiveGuid = $mbx.ArchiveGuid

# Check ELC last success on main archive
$logs = Export-MailboxDiagnosticLogs $archiveGuid -ExtendedProperties
$xmlprops = [xml]($logs.MailboxLog)
$xmlprops.Properties.MailboxTable.Property | Where-Object {$_.Name -eq "ELCLastSuccessTimestamp"} | Select-Object -ExpandProperty Value
```

- ❌ If ELC has **not run in the last 5 days** on the archive → expansion evaluation hasn't occurred:
  ```powershell
  Start-ManagedFolderAssistant $archiveGuid
  ```
- Also check MRM error logs on the archive:
  ```powershell
  (Export-MailboxDiagnosticLogs $archiveGuid -ComponentName MRM).MailboxLog
  ```

### Step 8 — Test Archive Connectivity

```powershell
Test-ArchiveConnectivity <user@contoso.com> -IncludeArchiveMRMConfiguration | Select-Object -ExpandProperty Result
```

- ❌ If result does NOT contain "Successfully" → archive connectivity is broken. Content cannot be moved/expanded. **Escalate.**

### Step 9 — Aggregated Size Check (1.5 TB Limit & Per-Location Quotas)

```powershell
$mbx = Get-Mailbox <user@contoso.com>
$totalAggregatedSizeGB = 0

foreach ($location in $mbx.MailboxLocations) {
    $parts = $location.Split(";")
    $guid = $parts[1]; $type = $parts[2]
    if ($type -cin "MainArchive","AuxArchive") {
        $mstat = Get-MailboxStatistics $guid
        $itemSizeGB = [math]::Round(([long]((($mstat.TotalItemSize.Value -split "\(")[1] -split " ")[0] -replace ",",""))/[math]::Pow(1024,3),3)
        $deletedSizeGB = [math]::Round(([long]((($mstat.TotalDeletedItemSize.Value -split "\(")[1] -split " ")[0] -replace ",",""))/[math]::Pow(1024,3),3)
        $totalAggregatedSizeGB += ($itemSizeGB + $deletedSizeGB)
        Write-Host "[$type] $guid — Items: ${itemSizeGB}GB, Deleted: ${deletedSizeGB}GB"
    }
}
Write-Host "Aggregated archive size: ${totalAggregatedSizeGB} GB"
```

- ❌ If aggregated size **>1400 GB (1.4 TB)** → approaching max limit. Consider archive swap or aggressive retention.
- ❌ If aggregated size **>1500 GB (1.5 TB)** → max limit reached. **No further expansion possible.**
- ❌ If any individual location (Main or Aux) is within **5 GB of its quota** → that location is full and content must move to a new aux.

**Check quota consistency:**

```powershell
$mbx | FL ArchiveQuota, RecoverableItemsQuota, ProhibitSendReceiveQuota
# Warning if ArchiveQuota + RecoverableItemsQuota > 240 GB (unusual)
```

### Step 10 — Check for Ghosted Folder Issues

When content moves from main archive to aux archive, "ghosted" copies remain for 30 days as a safety net. If ghosted content is not being flushed, archive space won't free up.

```powershell
$archiveGuid = (Get-Mailbox <user@contoso.com>).ArchiveGuid
$folderStats = Get-MailboxFolderStatistics $archiveGuid

# Find ghosted folders (moved to aux but copy still in main)
$ghostedFolders = $folderStats | Where-Object {
    $_.LastMovedTimeStamp -ne $null -and
    $_.ItemsInFolder -ne 0 -and
    $_.ContentMailboxGuid -ne $archiveGuid
}

$ghostedFolders | Format-Table FolderPath, FolderSize, ItemsInFolder, LastMovedTimeStamp, ContentMailboxGuid
```

- ❌ If ghosted folders are present and `LastMovedTimeStamp` is **>30 days old** → ghosted content is stuck. Trigger cleanup:
  ```powershell
  Start-ManagedFolderAssistant $archiveGuid -GhostedFolderCleanup
  ```
- ✅ If `LastMovedTimeStamp` is within 30 days → normal behavior, wait for automatic flush.

### Step 11 — Check for Default Folders Under IPM Root (Archive Corruption)

```powershell
$archiveGuid = (Get-Mailbox <user@contoso.com>).ArchiveGuid
$fstat = Get-MailboxFolderStatistics $archiveGuid
$fstat | Where-Object {$_.FolderType -ceq "Inbox" -or $_.FolderType -ceq "SentItems"} | FL FolderPath, FolderType
```

- ❌ If **Inbox** or **SentItems** folder types exist under the archive IPM root → archive folder structure is corrupted. This can block expansion. **Escalate** for default folder repair.

### Step 12 — Check for Active MRS Requests on Archive

```powershell
Get-MoveRequest <user@contoso.com> -ErrorAction SilentlyContinue | FL Status, PercentComplete
```

- ❌ If an active move/migration request exists → archive is locked. Expansion cannot proceed until the move completes.

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| Auto-expanding not enabled | Feature not turned on |
| Archive <90 GB | Below the expansion threshold |
| No AuxArchive + MFA not run | MFA hasn't evaluated the archive yet |
| Litigation Hold + quota still 100 GB | Quota not bumped to 110 GB |
| Growth >1 GB/day | Unsupported ingestion rate |
| ELC not run on archive in >5 days | MFA not processing the archive |
| Archive connectivity test failed | Broken connection — escalate |
| Aggregated size >1.5 TB | Maximum expansion limit reached |
| Individual archive location at quota | Per-location quota full, needs new aux |
| Ghosted folders stuck >30 days | Ghosted content not being flushed |
| Default folders (Inbox/SentItems) under IPM root | Archive folder corruption — escalate |
| Active MRS move request | Mailbox locked by migration |
| Aux archive count = 50 | Maximum aux archive limit reached |

### Resolution Summary

1. Enable auto-expanding archiving (org or user level).
2. Wait until archive reaches 90 GB threshold.
3. Manually trigger MFA on the archive GUID.
4. Re-enable auto-expanding on mailboxes with Litigation Hold to bump quota to 110 GB.
5. Ensure growth rate ≤1 GB/day. Provisioning can take up to 30 days.
6. If ELC hasn't run on archive in >5 days, trigger manually and check MRM logs for errors.
7. If archive connectivity fails, **escalate**.
8. If aggregated size >1.4 TB, plan for archive swap or implement retention delete policies.
9. If ghosted folders are stuck >30 days, run `Start-ManagedFolderAssistant <GUID> -GhostedFolderCleanup`.
10. If default folders found under archive IPM root, **escalate** for folder repair.
11. Wait for active MRS requests to complete.
12. If archive has reached **1.5 TB** or **50 aux archives** → no further expansion possible.

---

## TSG 5 — Inactive Mailbox Not Created After User Deletion

**Symptom:** A user was deleted from Entra ID, but their mailbox was permanently deleted instead of becoming an inactive mailbox. Data may be at risk.

### Step 1 — Check If the Mailbox Exists as Inactive

```powershell
Connect-ExchangeOnline

Get-Mailbox -InactiveMailboxOnly -Identity <user@contoso.com> -ErrorAction SilentlyContinue | FL UserPrincipalName, IsInactiveMailbox, InPlaceHolds, LitigationHoldEnabled
```

- ✅ If results returned with `IsInactiveMailbox = True` → mailbox IS inactive. Issue may be visibility-only (admin not checking the right place).
- ❌ If no results → go to Step 2.

### Step 2 — Check If the Mailbox Is Still in Soft-Delete (30-Day Window)

```powershell
Get-Mailbox -SoftDeletedMailbox -Identity <user@contoso.com> -ErrorAction SilentlyContinue | FL UserPrincipalName, WhenSoftDeleted, InPlaceHolds, LitigationHoldEnabled
```

- ✅ If soft-deleted mailbox found AND `WhenSoftDeleted` is **within the last 30 days** → mailbox is recoverable. Go to Step 3.
- ❌ If not found → the mailbox has been **permanently deleted**. Data loss has occurred. No recovery possible.

### Step 3 — Apply a Hold and Recover (Within 30-Day Window)

**Option A — Restore the user account (preferred):**

1. Restore the user in **Entra ID > Deleted Users**.
2. Apply a hold or retention policy to the mailbox.
3. If needed, re-delete the user — the mailbox will now become inactive.

**Option B — Apply a hold directly to the soft-deleted mailbox:**

```powershell
# Apply Litigation Hold
Set-Mailbox <user@contoso.com> -LitigationHoldEnabled $true -InactiveMailbox
```

### Step 4 — Investigate Why the Hold Was Missing

```powershell
# Check what retention policies exist and their scopes
Get-RetentionCompliancePolicy | FL Name, ExchangeLocation, Enabled, Mode
```

- ❌ If no retention policy covers the user's mailbox → this is the root cause. No hold = no inactive mailbox.
- ❌ If policy exists but `Enabled = False` or `Mode = PendingDeletion` → policy was not active at time of deletion.

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| No hold/retention policy on mailbox at time of deletion | Mailbox deleted without compliance hold |
| Policy existed but was in Error/Disabled state | Policy was not effectively applied |
| Soft-deleted mailbox found within 30 days | Recoverable — hold was missing but window still open |
| No soft-deleted or inactive mailbox found | Permanently purged (past 30-day window) |

### Resolution Summary

1. If within 30 days → restore user in Entra ID, apply hold, re-delete.
2. Going forward, ensure **all mailboxes** are covered by an org-wide retention policy BEFORE user deletion.
3. Use org-wide Purview retention policy with "retain" action to automatically cover all mailboxes.
4. Verify policy distribution: `Get-RetentionCompliancePolicy "<name>" -DistributionDetail`.

---

## TSG 6 — Items Stuck in SubstrateHolds / Recoverable Items Quota Exceeded

**Symptom:** Exchange mailbox's Recoverable Items folder is growing uncontrollably. Items appear stuck in the hidden `SubstrateHolds` folder. User may be unable to send/receive email due to quota.

### Step 1 — Assess the Recoverable Items Folder Size

```powershell
Connect-ExchangeOnline

Get-MailboxFolderStatistics <user@contoso.com> -FolderScope RecoverableItems | FL Name, FolderSize, ItemsInFolder, FolderPath
```

- Note the sizes of: **SubstrateHolds**, **Deletions**, **DiscoveryHolds**, **Purges**, **Versions**.
- If `SubstrateHolds` is the largest → go to Step 2.
- If `DiscoveryHolds` or `Purges` is largest → go to Step 4.

### Step 2 — Identify What Is Populating SubstrateHolds

`SubstrateHolds` stores retained copies of **Teams messages, Copilot interactions, and Viva Engage content**.

```powershell
# Check what holds are on the mailbox
Get-Mailbox <user@contoso.com> | FL InPlaceHolds, LitigationHoldEnabled

# Check if retention policies target this mailbox
Get-RetentionCompliancePolicy | Where-Object {$_.ExchangeLocation -eq "All" -or $_.ExchangeLocation -contains "<user>"} | FL Name, RetentionDuration
```

### Step 3 — Confirm Expected SubstrateHolds Cleanup Cadence

- SubstrateHolds items are cleaned by a backend **Timer-Based Assistant (TBA)** that runs every **3–4 days** (up to 7 days).
- Items are only deleted once **ALL** applicable retention periods have expired.
- ✅ If items are within the retention period → **by design**. No action needed.
- ❌ If retention period has expired but items persist beyond **7+ days** → **escalate to Microsoft Support** (TBA may be stuck).

### Step 4 — Check for Conflicting Holds Preventing Cleanup

```powershell
Get-Mailbox <user@contoso.com> | FL InPlaceHolds, LitigationHoldEnabled, ComplianceTagHoldApplied, DelayHoldApplied

# Decode hold GUIDs
# mbx<GUID> = Purview retention policy (Exchange)
# cld<GUID> = Purview retention policy (modern group)
# UniH<GUID> = eDiscovery case hold
# skp<GUID> = SharePoint/OneDrive retention (shouldn't affect EXO)
```

- ❌ If `LitigationHoldEnabled = True` → ALL items are retained indefinitely in Recoverable Items.
- ❌ If `DelayHoldApplied = True` → a recently removed hold has a 30-day delay hold in effect. Wait 30 days or:
  ```powershell
  Set-Mailbox <user@contoso.com> -RemoveDelayHoldApplied
  ```
- ❌ If multiple holds with different retention periods → the **longest** retention wins. All holds must expire before cleanup.

### Step 5 — Verify Dumpster Expiration Is Running

The Dumpster Expiration assistant is responsible for purging expired items from Recoverable Items. If it hasn't run, RI will grow indefinitely.

```powershell
# Check DumpsterExpiration last success on primary
$logs = Export-MailboxDiagnosticLogs <user@contoso.com> -ExtendedProperties
$xmlprops = [xml]($logs.MailboxLog)
$xmlprops.Properties.MailboxTable.Property | Where-Object {$_.Name -eq "DumpsterExpirationLastSuccessRunTimestamp"} | Select-Object -ExpandProperty Value
```

- ❌ If `DumpsterExpirationLastSuccessRunTimestamp` is **not found** or **>7 days old** → dumpster expiration is not processing. Get detailed logs:
  ```powershell
  (Export-MailboxDiagnosticLogs <user@contoso.com> -ComponentName DumpsterExpiration).MailboxLog
  ```

Also check on the **archive mailbox** if applicable:

```powershell
$archiveGuid = (Get-Mailbox <user@contoso.com>).ArchiveGuid
$archiveLogs = Export-MailboxDiagnosticLogs $archiveGuid -ExtendedProperties
$archiveXml = [xml]($archiveLogs.MailboxLog)
$archiveXml.Properties.MailboxTable.Property | Where-Object {$_.Name -eq "DumpsterExpirationLastSuccessRunTimestamp"} | Select-Object -ExpandProperty Value
```

### Step 6 — Check Primary & Archive Dumpster Utilization vs Quota

```powershell
$mbx = Get-Mailbox <user@contoso.com>
$primaryStats = Get-MailboxStatistics <user@contoso.com>

Write-Host "Primary — TotalItemSize: $($primaryStats.TotalItemSize) / ProhibitSendReceiveQuota: $($mbx.ProhibitSendReceiveQuota)"
Write-Host "Primary — TotalDeletedItemSize: $($primaryStats.TotalDeletedItemSize) / RecoverableItemsQuota: $($mbx.RecoverableItemsQuota)"
```

- ❌ If `TotalDeletedItemSize` is within **5 GB** of `RecoverableItemsQuota` → dumpster is full. This directly causes the quota exceeded symptom.
- ❌ If `TotalItemSize` is within **5 GB** of `ProhibitSendReceiveQuota` → primary is also full (send/receive blocked).

### Step 7 — Check All Holds (Org-Level and Mailbox-Level)

```powershell
# Org-level holds
(Get-OrganizationConfig).InPlaceHolds

# Mailbox-level holds (comprehensive)
Get-Mailbox <user@contoso.com> | FL LitigationHoldEnabled, RetentionHoldEnabled, ComplianceTagHoldApplied, DelayHoldApplied, DelayReleaseHoldApplied, LitigationHoldDuration, LitigationHoldDate, LitigationHoldOwner, StartDateForRetentionHold, EndDateForRetentionHold, InPlaceHolds
```

- ⚠️ Note: `RetentionHoldEnabled` suspends expiration at **IPM level only** (visible folders — both deletions and archival). It has **no impact on Dumpster/Recoverable Items expiration**.
- ❌ If `DelayReleaseHoldApplied = True` (in addition to `DelayHoldApplied`) → additional delay hold variant is active.

### Step 8 — Immediate Quota Relief (If Mailbox Is Blocked)

```powershell
# Temporarily increase Recoverable Items quota
Set-Mailbox <user@contoso.com> -RecoverableItemsQuota 100GB -RecoverableItemsWarningQuota 90GB
```

> ⚠️ This is a temporary measure. Address the underlying hold/retention configuration.

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| SubstrateHolds large + retention period not yet expired | By design — items retained per policy |
| SubstrateHolds large + retention expired + >7 days | TBA cleanup stuck — escalate |
| Litigation Hold enabled | Indefinite hold retaining all RI content |
| `DelayHoldApplied` or `DelayReleaseHoldApplied` = True | Delay hold from recently removed policy |
| Multiple overlapping holds | Longest retention period governs cleanup |
| DumpsterExpiration not run in >7 days | Dumpster expiration assistant stuck |
| Primary dumpster within 5 GB of quota | Recoverable Items quota nearly exhausted |
| Org-level InPlaceHolds present | Organization-wide holds retaining all RI content |

### Resolution Summary

1. If within retention period → no action needed (by design).
2. Remove unnecessary holds (Litigation Hold, eDiscovery holds, org-level holds).
3. Remove delay hold if appropriate: `Set-Mailbox -RemoveDelayHoldApplied`.
4. If DumpsterExpiration hasn't run in >7 days → investigate logs and escalate if stuck.
5. Increase RI quota temporarily if mailbox is blocked.
6. Escalate if items persist beyond retention + 7 days.

---

## TSG 7 — Teams Messages Not Being Deleted After Retention Period

**Symptom:** A "delete-only" or "retain then delete" retention policy targets Teams, but messages remain visible to users beyond the expected retention period.

### Step 1 — Verify the Retention Policy Targets Teams

```powershell
Connect-IPPSSession

Get-RetentionCompliancePolicy "<PolicyName>" | FL TeamsChannelLocation, TeamsChatLocation, Enabled, DistributionStatus
Get-RetentionComplianceRule -Policy "<PolicyName>" | FL RetentionDuration, RetentionComplianceAction
```

- ❌ If `TeamsChannelLocation` and `TeamsChatLocation` are empty → policy does not target Teams.
- ❌ If `DistributionStatus` ≠ Success → go to **TSG 2**.
- ✅ Policy targets Teams correctly → go to Step 2.

### Step 2 — Understand the Expected Deletion Timeline

Teams message deletion follows a **multi-step async process**:

| Phase | Duration | What Happens |
|-------|----------|-------------|
| Retention period expires | As configured | Timer starts from message creation/modification |
| MFA processes the mailbox | Up to **7 days** | SubstrateHolds copy marked for deletion |
| TBA cleanup runs | Up to **7 days** | Backend removes the substrate copy |
| Teams client cache refresh | Up to **2 days** | Message disappears from Teams UI |
| **Total maximum lag** | **Up to 16 days** | After retention period expiry |

- If within this 16-day window → **expected behavior**, wait.

### Step 3 — Verify SubstrateHolds Content in the User's Mailbox

```powershell
Connect-ExchangeOnline

Get-MailboxFolderStatistics <user@contoso.com> -FolderScope RecoverableItems | Where-Object {$_.Name -eq "SubstrateHolds"} | FL FolderSize, ItemsInFolder
```

- If items are present and recent → backend hasn't cleaned up yet (within expected lag).

### Step 4 — Check for Conflicting Holds Preventing Deletion

```powershell
Get-Mailbox <user@contoso.com> | FL InPlaceHolds, LitigationHoldEnabled, ComplianceTagHoldApplied
```

- ❌ If `LitigationHoldEnabled = True` → overrides retention deletion. Items will be retained indefinitely.
- ❌ If another retention policy with a **longer retain period** exists → the longest retention wins (Principles of Retention).
- ❌ If `ComplianceTagHoldApplied = True` → a retention label with "retain" action is applied, overriding delete-only policies.

### Step 5 — Verify Shared/Private Channel Coverage

```powershell
# Shared channel messages are stored in the Team's group mailbox
Get-UnifiedGroup -Identity "<TeamName>" | FL InPlaceHolds

# Private channels (post-2025 migration) may use separate mailboxes
Get-Mailbox -GroupMailbox | Where-Object {$_.DisplayName -like "*<TeamName>*"} | FL InPlaceHolds
```

- ❌ If the retention policy doesn't include the group mailbox → shared channel messages are not covered.

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| Within 16-day lag window | Normal async deletion process |
| Litigation Hold or longer competing policy | Another hold overrides deletion |
| Teams channels not in policy scope | Shared/private channels not targeted |
| Policy not distributed | Distribution failure — see TSG 2 |

### Resolution Summary

1. Wait up to 16 days past retention expiry for async processing.
2. Remove conflicting holds (Litigation Hold, longer retention policies).
3. Ensure shared channels are covered by including M365 Groups in policy scope.
4. Fix distribution issues per TSG 2.

---

## TSG 8 — SharePoint Site Deletion Blocked by Retention Policy

**Symptom:** Admin attempts to delete a SharePoint site but receives an error that the site cannot be deleted due to a compliance policy. Or, the site remains in a "deleting" state indefinitely.

### Step 1 — Identify Holds on the Site

```powershell
Connect-IPPSSession

# Find all retention policies targeting SharePoint
Get-RetentionCompliancePolicy | Where-Object {$_.SharePointLocation -eq "All" -or $_.SharePointLocation -contains "<SiteURL>"} | FL Name, Guid, SharePointLocation
```

```powershell
# Check via SharePoint PnP
Connect-PnPOnline -Url "<SiteURL>" -Interactive
Get-PnPSite -Includes InformationRightsManagementSettings | FL ComplianceAttribute
```

### Step 2 — Check the Preservation Hold Library

```powershell
# Using PnP PowerShell
Get-PnPList -Identity "Preservation Hold Library" | FL ItemCount, LastItemModifiedDate
```

- If `ItemCount` > 0 → the PHL contains retained copies blocking site deletion.

### Step 3 — Remove the Retention Policy from the Site

```powershell
# Remove specific site from policy scope
Set-RetentionCompliancePolicy "<PolicyName>" -RemoveSharePointLocation "<SiteURL>"
```

- Or exclude the site:
  ```powershell
  Set-RetentionCompliancePolicy "<PolicyName>" -AddSharePointLocationException "<SiteURL>"
  ```

### Step 4 — Wait for PHL Cleanup

After the hold is removed:

| Phase | Duration |
|-------|----------|
| PHL items moved to site Recycle Bin | Up to **7 days** |
| First-stage Recycle Bin retention | **93 days** |
| Second-stage Recycle Bin purge | **30 days** |
| Site becomes deletable | **Total: up to ~130 days** |

> ⚠️ This is the **maximum** timeline. In practice, cleanup often completes faster.

### Step 5 — Retry Site Deletion

After the PHL is empty and cleanup is complete:

```powershell
Remove-PnPTenantSite -Url "<SiteURL>" -Force
```

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| Site in scope of a retention policy | Retention hold prevents site deletion |
| PHL contains items | Retained copies blocking cleanup |
| Multiple policies targeting the site | All policies must be removed before deletion |

### Resolution Summary

1. Identify and remove all retention policies targeting the site.
2. Wait for PHL cleanup (up to 130 days worst case).
3. Retry site deletion after cleanup completes.
4. For urgent deletion needs, escalate to Microsoft Support for accelerated PHL cleanup.

---

## TSG 9 — Auto-Apply Retention Labels Not Labeling Content

**Symptom:** An auto-apply retention label policy is configured (keyword query, sensitive info type, or trainable classifier), but content is not being labeled.

### Step 1 — Verify the Auto-Apply Policy Status

```powershell
Connect-IPPSSession

Get-RetentionCompliancePolicy "<PolicyName>" | FL Name, Enabled, Mode, DistributionStatus, Type
Get-RetentionCompliancePolicy "<PolicyName>" -DistributionDetail | FL DistributionDetail
```

- ❌ If `Enabled = False` or `DistributionStatus = Error` → fix distribution (see TSG 2).
- ❌ If portal shows **"Off (Error)"** → this is a distribution failure. Retry: `Set-RetentionCompliancePolicy "<PolicyName>" -RetryDistribution`. If still failing, see the detailed reference at [auto-apply-labels.md](dlm-diagnostics/references/auto-apply-labels.md).
- ❌ If `Mode = Simulate` → policy is in simulation mode, not applying labels. Change to enforce:
  ```powershell
  Set-RetentionCompliancePolicy "<PolicyName>" -Mode Enable
  ```
- ✅ Enabled and distributed → go to Step 2.

### Step 2 — Verify the Auto-Apply Rule Configuration

```powershell
Get-RetentionComplianceRule -Policy "<PolicyName>" | FL Name, ContentMatchQuery, ContentContainsSensitiveInformation, RetentionComplianceAction, PublishComplianceTag
```

- ❌ If `ContentMatchQuery` is empty AND no SIT/classifier configured → no matching criteria set.
- ❌ If `PublishComplianceTag` is empty → no label is linked to the rule.

### Step 3 — Check if Content Already Has a Label

**Auto-apply labels NEVER overwrite an existing label.** This is the most common reason for "not labeling."

```powershell
# For SharePoint, check via PnP
Get-PnPListItem -List "<LibraryName>" -Fields "ComplianceTag" | Select-Object -ExpandProperty FieldValues | FL ComplianceTag
```

- ❌ If items already have a label (including a default label) → auto-apply will skip them. **This is by design.**

### Step 4 — Check Trainable Classifier Limitations

If using a trainable classifier:

- Classifiers can only evaluate content created within the **last 6 months** (180 days).
- Content must have **sufficient text** for classification (very short items may not match).
- Classifiers are **not available with adaptive scopes**.

### Step 5 — Verify Content Age and Processing Time

- Auto-apply label policies can take **up to 7 days** to start labeling.
- For keyword queries (KQL), ensure the content is **indexed** in the search index.
- Test the KQL query directly in Content Search to verify matches:
  ```powershell
  # In Purview Compliance Portal > Content Search > New Search
  # Use the same KQL query from the auto-apply rule
  ```

### Step 6 — Check for Policy Limits

```powershell
# Count total auto-apply policies
(Get-RetentionCompliancePolicy | Where-Object {$_.Type -eq "ApplyTag"}).Count
```

- Maximum of **10,000 policies** across the tenant (all policy types combined).

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| Content already has a label | Auto-apply never overwrites existing labels |
| Policy in Simulation mode | Labels not actually applied |
| KQL query returns no results | Query syntax incorrect or content not indexed |
| Trainable classifier + content >6 months old | Classifier cannot evaluate old content |
| Policy not distributed | Distribution failure |

### Resolution Summary

1. Remove existing labels from content if auto-apply should override (must be done manually or via script).
2. Switch policy from Simulation to Enable mode.
3. Fix KQL query syntax — test in Content Search first.
4. For trainable classifiers, ensure content is recent (<6 months) and has sufficient text.
5. Wait up to 7 days for initial policy processing.

---

## TSG 10 — MRM and Purview Retention Conflict — Unexpected Deletion or Retention

**Symptom:** Items in Exchange mailboxes are being unexpectedly deleted (MRM delete tag deleting content that Purview should retain), or items are unexpectedly retained (Purview hold preventing MRM cleanup). Admins are confused about which system takes precedence.

### Step 1 — Identify All Active Retention Mechanisms on the Mailbox

```powershell
Connect-ExchangeOnline

# MRM (legacy Exchange)
Get-Mailbox <user@contoso.com> | FL RetentionPolicy, RetentionHoldEnabled

# Purview retention
Get-Mailbox <user@contoso.com> | FL InPlaceHolds, LitigationHoldEnabled, ComplianceTagHoldApplied

# eDiscovery
Get-Mailbox <user@contoso.com> | FL InPlaceHolds
# UniH<GUID> entries = eDiscovery case holds
```

### Step 2 — Enumerate MRM Tags and Their Actions

```powershell
$policy = (Get-Mailbox <user@contoso.com>).RetentionPolicy
Get-RetentionPolicy $policy | Select -ExpandProperty RetentionPolicyTagLinks

# For each tag, check the action
Get-RetentionPolicyTag | Where-Object {$_.RetentionAction -ne "MoveToArchive"} | FL Name, Type, AgeLimitForRetention, RetentionAction, RetentionEnabled
```

- Look for tags with `RetentionAction = DeleteAndAllowRecovery` or `PermanentlyDelete`.
- Note the `AgeLimitForRetention` — this is when deletion fires.

### Step 3 — Enumerate Purview Retention Policies Affecting This Mailbox

```powershell
Connect-IPPSSession

Get-RetentionCompliancePolicy | Where-Object {$_.ExchangeLocation -eq "All" -or $_.ExchangeLocation -contains "<user>"} | FL Name, Guid

# For each policy, get the rule
Get-RetentionComplianceRule -Policy "<PolicyName>" | FL RetentionDuration, RetentionComplianceAction
```

### Step 4 — Apply the Precedence Rules

**Microsoft's Principles of Retention (order of precedence):**

| Priority | Principle |
|----------|-----------|
| 1 | **Retention wins over deletion.** If any policy says "retain," the item is kept regardless of delete policies. |
| 2 | **Longest retention period wins.** If multiple retain policies apply, the longest duration governs. |
| 3 | **Explicit inclusion wins over implicit.** A policy targeting a specific user overrides an org-wide policy. |
| 4 | **Shortest deletion period wins.** If only delete policies apply (no retain), the shortest delete period fires first. |

**MRM vs. Purview interaction:**
- Purview retention holds are enforced at the **Recoverable Items** level.
- MRM can delete items from the user's visible mailbox, but if a Purview hold exists, the deleted items are **preserved in Recoverable Items**.
- MRM can appear to "delete" items while Purview silently retains them.

### Step 5 — Identify the Specific Conflict

| Scenario | What Happens | Resolution |
|----------|-------------|------------|
| MRM deletes + Purview retains | Item deleted from user view but preserved in Recoverable Items | **Expected behavior** — Purview hold wins at the RI level |
| MRM archive tag + Purview retain | Item moves to archive AND is retained — no conflict | No action needed |
| MRM deletes + No Purview policy | Item permanently deleted after RI retention period (14 days default) | If unintended, apply a Purview retain policy immediately |
| Purview delete-only + MRM retain (NeverDelete tag) | MRM NeverDelete is a **system tag** and cannot be removed, but Purview delete will still process after RI evaluation | Purview deletion governs post-RI |
| Multiple Purview policies conflict | Longest retain + shortest delete (per Principles of Retention) | Consolidate policies to reduce confusion |

### Step 6 — Deep MRM Diagnostics: Validate TracingFAI & MRM Configuration

When MRM behaves unexpectedly, the FAI (Folder Associated Item) that stores MRM configuration on the mailbox may be corrupted or stale.

**Check TracingFAI for processing errors:**

```powershell
$tracingFai = Export-MailboxDiagnosticLogs <user@contoso.com> -ComponentName TracingFai
$faiData = $tracingFai.MailboxLog | ConvertFrom-Json

# Check for failure entries (Fs array with non-zero entries)
$faiData | Where-Object {$_.Fs.Count -ne 0} | ForEach-Object {
    Write-Host "Errors in folder: $($_.P)" -ForegroundColor Red
    $_.Fs | Group-Object -Property F | ForEach-Object {
        switch ($_.Name) {
            1 { "DumpsterQuotaTooSmall" }
            2 { "RecipientCorrupt" }
            3 { "IPMOversizeMessage" }
            4 { "DumpsterOversizeMessage" }
            5 { "TagUnexpectedActionChanged" }
            6 { "TooManyTagsAgeLimitChanged" }
            7 { "TagMultipleContentSettings" }
            8 { "CorruptRecipients" }
            9 { "CorruptComplianceEntry" }
            10 { "ResetComplianceEntry" }
            11 { "FolderItemCountLimit" }
        }
    }
}
```

- ❌ If errors like `TagUnexpectedActionChanged`, `CorruptComplianceEntry`, or `RecipientCorrupt` → MRM is processing with corrupted state.

**Validate MRM Policy Tag consistency (FAI vs. policy):**

```powershell
$config = Test-ArchiveConnectivity <user@contoso.com> -IncludeArchiveMRMConfiguration

# Tags stamped on the mailbox (FAI)
$policyTags = ([xml]$config.PrimaryMRMConfiguration).UserConfiguration.Info.Data.PolicyTag
$archiveTags = ([xml]$config.PrimaryMRMConfiguration).UserConfiguration.Info.Data.ArchiveTag

# Tags defined in the assigned retention policy
$mbx = Get-Mailbox <user@contoso.com>
$policyLinks = (Get-RetentionPolicy $mbx.RetentionPolicy).RetentionPolicyTagLinks
$definedTags = Get-RetentionPolicyTag | Where-Object {$_.Identity -in $policyLinks}

# Compare — every defined tag should exist in the FAI
$definedTags | Format-Table Name, RetentionAction, AgeLimitForRetention, Type
$policyTags | Format-Table Name, Guid, IsVisible, Type
```

- ❌ If the FAI tags **don't match** the defined `RetentionPolicyTagLinks` → the MRM configuration is stale. This is a common cause of unexpected deletion or retention:
  ```powershell
  # Reset the MRM FAI and re-trigger
  Set-Mailbox <user@contoso.com> -RemoveMRMConfiguration
  Start-ManagedFolderAssistant <user@contoso.com>
  ```

### Step 7 — Remediate

**To stop MRM from deleting items Purview should retain:**

```powershell
# Option A: Remove the MRM delete tag from the policy
Set-RetentionPolicy "<MRMPolicyName>" -RetentionPolicyTagLinks @{Remove="<DeleteTagName>"}

# Option B: Disable the specific MRM delete tag
Set-RetentionPolicyTag "<TagName>" -RetentionEnabled $false

# Option C: Remove MRM policy entirely (if migrating fully to Purview)
Set-Mailbox <user@contoso.com> -RetentionPolicy $null
```

**If FAI is corrupt/stale:**

```powershell
# Reset MRM configuration and re-process
Set-Mailbox <user@contoso.com> -RemoveMRMConfiguration
Start-ManagedFolderAssistant <user@contoso.com>
```

**To recover items MRM has already deleted:**

```powershell
# Check Recoverable Items
Get-MailboxFolderStatistics <user@contoso.com> -FolderScope RecoverableItems | FL Name, ItemsInFolder, FolderSize

# If Purview hold was active, items are in DiscoveryHolds or Purges subfolder
# Use Content Search or eDiscovery to recover
```

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| MRM delete tag + no Purview retain policy | MRM deleting without compliance safety net |
| MRM delete tag + Purview retain policy | Expected behavior — items in RI (user perceives deletion) |
| Old MRM policy still assigned after Purview migration | Legacy MRM not cleaned up |
| Multiple conflicting Purview policies | Principles of Retention creating unexpected outcomes |
| TracingFAI errors (CorruptComplianceEntry, TagUnexpectedActionChanged) | Corrupted MRM processing state |
| FAI tags don't match RetentionPolicyTagLinks | Stale MRM configuration — needs `RemoveMRMConfiguration` |

### Resolution Summary

1. **Audit both systems**: List all MRM tags and Purview policies on every affected mailbox.
2. **Disable MRM delete tags** that conflict with Purview retention.
3. **Consolidate to Purview**: Remove MRM policies if the organization has fully migrated to Purview DLM.
4. **Reset corrupt/stale FAI**: Run `Set-Mailbox -RemoveMRMConfiguration` then `Start-ManagedFolderAssistant`.
5. **Check TracingFAI** for processing errors that indicate corruption.
6. **Communicate to admins**: MRM deletion from the user's view ≠ permanent deletion if Purview holds exist.
7. **Recover content** from Recoverable Items via Content Search / eDiscovery if needed.
8. Going forward, use **Purview retention policies only** for compliance retention and deprecate MRM delete/retain tags.

---

## TSG 11 — Adaptive Scope Issues — Wrong Members, No Members, or Query Failures

**Symptom:** Adaptive scope includes wrong members, shows no members, cannot be used with trainable classifiers, or the associated retention policy is not applying as expected.

### Step 1 — Verify Scope Configuration and Age

```powershell
Connect-IPPSSession

Get-AdaptiveScope "<ScopeName>" | FL Name, LocationType, FilterQuery, WhenCreated, WhenChanged
```

- ❌ If `WhenCreated` is **< 5 days ago** → scope has not had time to fully populate. Wait at least 5 days before troubleshooting further.
- ✅ Scope is ≥ 5 days old → go to Step 2.

### Step 2 — Validate the OPATH/KQL Query

**For User scopes:**

```powershell
Connect-ExchangeOnline

# Test the filter query independently
Get-Recipient -Filter "<same filter from adaptive scope>" -ResultSize 10 | FL Name, RecipientType, RecipientTypeDetails
Get-Recipient -Filter "<same filter from adaptive scope>" -ResultSize Unlimited | Measure-Object
```

**For M365 Group scopes:**

```powershell
Get-Mailbox -GroupMailbox -Filter "<same filter from adaptive scope>" -ResultSize Unlimited | Measure-Object
```

**For SharePoint scopes:** validate the KQL query in SharePoint search (`https://<tenant>.sharepoint.com/search`).

- ❌ If the query returns an error → fix OPATH syntax (check for unbalanced quotes, wrong operators, invalid attributes).
- ❌ If the query returns 0 results → verify attribute values match actual directory data.
- ✅ Query returns expected results → go to Step 3.

### Step 3 — Check for Non-Mailbox User Inflation

```powershell
# Compare Get-User (all user objects) vs Get-Recipient (mailbox-enabled users)
Get-User -Filter "<same filter from adaptive scope>" -ResultSize Unlimited | Measure-Object
Get-Recipient -RecipientTypeDetails UserMailbox -Filter "<same filter from adaptive scope>" -ResultSize Unlimited | Measure-Object
```

- ❌ If `Get-User` count **significantly exceeds** `Get-Recipient` count → unlicensed/synced user accounts without mailboxes are inflating the scope. Refine the filter to target only mailbox-enabled recipients.

### Step 4 — Verify Associated Policy Distribution

```powershell
Get-RetentionCompliancePolicy "<PolicyName>" | FL Name, Enabled, DistributionStatus, AdaptiveScopeLocation
Get-RetentionCompliancePolicy "<PolicyName>" -DistributionDetail | FL DistributionDetail
```

- ❌ If `DistributionStatus` ≠ Success → switch to **TSG 2** for distribution troubleshooting.
- ✅ Distributed successfully → go to Step 5.

### Step 5 — Check for Trainable Classifier Limitation

- ❌ If the policy is an auto-apply label policy using a **trainable classifier** AND an **adaptive scope** → this combination is **not supported**. Use a static scope instead.

### Root Cause Confirmation

| Finding | Root Cause |
|---------|-----------|
| Scope < 5 days old | Scope has not had time to populate |
| OPATH/KQL query returns 0 or error | Incorrect filter query syntax or attribute values |
| Get-User count >> Get-Recipient count | Unlicensed/synced accounts inflating scope |
| Arbitration mailboxes in scope details | Expected behavior — excluded from policy enforcement |
| Policy distribution failure | Distribution error — see TSG 2 |
| Trainable classifier + adaptive scope | Unsupported combination — use static scope |

### Resolution Summary

1. Wait at least 5 days for newly created scopes to populate.
2. Validate OPATH/KQL queries with `Get-Recipient -Filter` or SharePoint search before assigning to policies.
3. Refine filter queries to exclude unlicensed/non-mailbox users if inflating counts.
4. Use static scopes for auto-apply policies with trainable classifiers.
5. Fix distribution issues per TSG 2.

---

## Quick Reference — TSG Decision Tree

```
Customer reports DLM issue
│
├── Policy not applying?              → TSG 1
├── Policy stuck in Error?            → TSG 2
├── Items not moving to archive?      → TSG 3
├── Archive not expanding?            → TSG 4
├── Inactive mailbox not created?     → TSG 5
├── Recoverable Items / SubstrateHolds growing?  → TSG 6
├── Teams messages not deleted?       → TSG 7
├── SharePoint site can't be deleted? → TSG 8
├── Auto-apply labels not working?    → TSG 9
├── MRM vs Purview conflict?          → TSG 10
└── Adaptive scope wrong/no members?  → TSG 11
```

---

## Diagnostic Quick Commands Cheat Sheet

```powershell
# ═══════ CONNECTION ═══════
Connect-IPPSSession                              # Purview / Compliance PowerShell
Connect-ExchangeOnline                           # Exchange Online PowerShell

# ═══════ RETENTION POLICY ═══════
Get-RetentionCompliancePolicy "<name>" | FL *
Get-RetentionCompliancePolicy "<name>" -DistributionDetail
Set-RetentionCompliancePolicy "<name>" -RetryDistribution
Remove-RetentionCompliancePolicy "<name>" -ForceDeletion

# ═══════ RETENTION RULES & LABELS ═══════
Get-RetentionComplianceRule -Policy "<name>" | FL *
Get-ComplianceTag | FL Name, RetentionDuration, RetentionAction

# ═══════ MAILBOX HOLDS ═══════
Get-Mailbox <user> | FL InPlaceHolds, LitigationHoldEnabled, ComplianceTagHoldApplied, DelayHoldApplied, DelayReleaseHoldApplied, RetentionPolicy, RetentionHoldEnabled, ElcProcessingDisabled

# ═══════ ARCHIVE ═══════
Get-Mailbox <user> | FL ArchiveStatus, AutoExpandingArchiveEnabled, ArchiveQuota
Get-MailboxStatistics <user> -Archive | FL TotalItemSize, TotalDeletedItemSize
Get-Mailbox <user> | Select -ExpandProperty MailboxLocations

# ═══════ MRM ═══════
Get-RetentionPolicy "<name>" | FL RetentionPolicyTagLinks
Get-RetentionPolicyTag | FL Name, Type, RetentionAction, AgeLimitForRetention, RetentionEnabled

# ═══════ RECOVERABLE ITEMS ═══════
Get-MailboxFolderStatistics <user> -FolderScope RecoverableItems | FL Name, FolderSize, ItemsInFolder

# ═══════ INACTIVE MAILBOXES ═══════
Get-Mailbox -InactiveMailboxOnly | FL UserPrincipalName, InPlaceHolds, LitigationHoldEnabled
Get-Mailbox -SoftDeletedMailbox | FL UserPrincipalName, WhenSoftDeleted

# ═══════ MFA TRIGGER ═══════
Start-ManagedFolderAssistant <user or GUID>
Start-ManagedFolderAssistant <archiveGUID> -GhostedFolderCleanup   # Force ghosted folder flush

# ═══════ ADVANCED DIAGNOSTICS ═══════
# ELC last success timestamp
$logs = Export-MailboxDiagnosticLogs <user> -ExtendedProperties
([xml]$logs.MailboxLog).Properties.MailboxTable.Property | Where-Object {$_.Name -eq "ELCLastSuccessTimestamp"}

# DumpsterExpiration last success timestamp
([xml]$logs.MailboxLog).Properties.MailboxTable.Property | Where-Object {$_.Name -eq "DumpsterExpirationLastSuccessRunTimestamp"}

# MRM error logs
(Export-MailboxDiagnosticLogs <user> -ComponentName MRM).MailboxLog

# TracingFAI (tag processing errors)
(Export-MailboxDiagnosticLogs <user> -ComponentName TracingFai).MailboxLog | ConvertFrom-Json

# DumpsterExpiration logs
(Export-MailboxDiagnosticLogs <user> -ComponentName DumpsterExpiration).MailboxLog

# Archive connectivity + MRM config validation
Test-ArchiveConnectivity <user> -IncludeArchiveMRMConfiguration

# Reset corrupted MRM FAI
Set-Mailbox <user> -RemoveMRMConfiguration

# Ghosted folder detection
Get-MailboxFolderStatistics <archiveGUID> | Where-Object {$_.LastMovedTimeStamp -ne $null -and $_.ItemsInFolder -ne 0}

# ═══════ SELF-HELP DIAGNOSTICS ═══════
# https://aka.ms/PillarArchiveMailbox
# https://aka.ms/PillarRetentionPolicy
```
