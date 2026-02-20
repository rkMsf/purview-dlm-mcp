# Microsoft Purview Data Lifecycle Management (DLM) — Top Customer Escalation Issues

> **Last Updated:** February 19, 2026  
> **Sources:** Microsoft Learn Documentation, Microsoft 365 Troubleshooting KB Articles

---

## Table of Contents

1. [Retention Policy Errors & Distribution Failures](#1-retention-policy-errors--distribution-failures)
2. [Retention Policy Not Taking Effect / Delayed Application](#2-retention-policy-not-taking-effect--delayed-application)
3. [SharePoint / OneDrive — Preservation Hold Library & Storage Issues](#3-sharepoint--onedrive--preservation-hold-library--storage-issues)
4. [Exchange Online — Mailbox Retention Issues](#4-exchange-online--mailbox-retention-issues)
5. [Teams Retention — Messages Not Being Deleted / Unexpected Deletion](#5-teams-retention--messages-not-being-deleted--unexpected-deletion)
6. [Teams Private Channel Migration Impact (2025)](#6-teams-private-channel-migration-impact-2025)
7. [Auto-Apply Retention Labels Not Working](#7-auto-apply-retention-labels-not-working)
8. [Retention Label Policy — "Off (Error)" Status](#8-retention-label-policy--off-error-status)
9. [Disposition Review Problems](#9-disposition-review-problems)
10. [Adaptive Scope — Query Not Targeting Correct Users/Sites](#10-adaptive-scope--query-not-targeting-correct-userssites)
11. [Adaptive Scope — Delayed Membership Population](#11-adaptive-scope--delayed-membership-population)
12. [Adaptive Scope — Trainable Classifiers Not Supported](#12-adaptive-scope--trainable-classifiers-not-supported)
13. [Policy Limits Exceeded](#13-policy-limits-exceeded)
14. [Policy Stuck in PendingDeletion](#14-policy-stuck-in-pendingdeletion)
15. [Conflicts Between Multiple Retention Policies / Labels](#15-conflicts-between-multiple-retention-policies--labels)
16. [Archive Mailboxes — Enabling, Expanding, and Items Not Moving](#16-archive-mailboxes--enabling-expanding-and-items-not-moving)
17. [Inactive Mailboxes — Creating, Recovering, Restoring, and Deleting](#17-inactive-mailboxes--creating-recovering-restoring-and-deleting)
18. [MRM (Messaging Records Management) — Retention Tags, Policies, and MFA Issues](#18-mrm-messaging-records-management--retention-tags-policies-and-mfa-issues)
19. [Exchange Online — Items Stuck in SubstrateHolds / Recoverable Items Quota Exceeded](#19-exchange-online--items-stuck-in-substrateholds--recoverable-items-quota-exceeded)
20. [SharePoint/OneDrive — Site Deletion Blocked by Retention / Files Not Deleted](#20-sharepointonedrive--site-deletion-blocked-by-retention--files-not-deleted)
21. [Teams Retention — Shared Channels, Private Channels, and Chat-Specific Issues](#21-teams-retention--shared-channels-private-channels-and-chat-specific-issues)
22. [Import Service / PST Import — Common Failures and Issues](#22-import-service--pst-import--common-failures-and-issues)

---

## 1. Retention Policy Errors & Distribution Failures

### 1a. Error: "Settings not found"

| Field | Detail |
|---|---|
| **Problem** | In the Microsoft Purview portal, the policy details pane shows **"Settings not found"**. |
| **Root Cause** | The retention policy has no retention rules configured. This can happen if a policy was created via PowerShell without adding a rule, or if a rule was inadvertently removed. |
| **Resolution** | **Option A — Portal:** Edit the policy → go to Retention settings → add retain/delete rules.<br>**Option B — PowerShell:** |

```powershell
# Connect to Security & Compliance PowerShell
Connect-IPPSSession

# Add a retention rule to the policy
New-RetentionComplianceRule -Name "<rule name>" -Policy "<policy name>" -RetentionDuration Unlimited

# For Teams private channels / Viva Engage:
New-AppRetentionComplianceRule -Name "<rule name>" -Policy "<policy name>" -RetentionDuration Unlimited
```

---

### 1b. Error: "Something went wrong" (PolicyNotifyError)

| Field | Detail |
|---|---|
| **Problem** | Policy details pane shows **"Something went wrong"**. PowerShell shows `PolicyNotifyError` in `DistributionResults`. |
| **Root Cause** | An unspecified error occurred in the notification pipeline of the policy sync/distribution process. |
| **Resolution** | Retry distribution: |

```powershell
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

---

### 1c. Error: "The location is ambiguous" (MultipleInactiveRecipientsError)

| Field | Detail |
|---|---|
| **Problem** | Policy shows **"The location is ambiguous"**. PowerShell shows `MultipleInactiveRecipientsError`. |
| **Root Cause** | The system found more than one result for a specified location (e.g., duplicate mailboxes, including inactive ones). |
| **Resolution** | Remove duplicate locations from the policy, then retry: |

```powershell
# Remove the duplicate Exchange location
Set-RetentionCompliancePolicy -Identity "<policy name>" -RemoveExchangeLocation "duplicate@contoso.com"

# Retry distribution
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

---

### 1d. Error: "The location is out of storage" (SiteOutOfQuota)

| Field | Detail |
|---|---|
| **Problem** | Policy creation or update fails with **"The location is out of storage"**. `SiteOutOfQuota` in distribution results. |
| **Root Cause** | The SharePoint/OneDrive site does not have enough storage for the Preservation Hold library to function. Retained content (copies in the Preservation Hold library) consumes the site's storage quota. |
| **Resolution** | 1. Increase storage quota for the site (contact SharePoint admin).<br>2. Delete unnecessary items to free space.<br>3. Retry distribution: |

```powershell
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

---

### 1e. Error: "The site is locked" (SiteInReadOnlyOrNotAccessible)

| Field | Detail |
|---|---|
| **Problem** | Policy shows **"The site is locked"**. |
| **Root Cause** | An admin locked the site, or the system temporarily locked it during an automated process (e.g., site move). The `Set-SPOSite -LockState NoAccess` or `ReadOnly` setting prevents retention from applying. |
| **Resolution** | 1. Contact SharePoint admin to unlock the site.<br>2. Retry distribution: |

```powershell
# Check site lock status
Get-SPOSite -Identity "https://contoso.sharepoint.com/sites/locked-site" | Select LockState

# Unlock the site
Set-SPOSite -Identity "https://contoso.sharepoint.com/sites/locked-site" -LockState Unlock

# Retry retention policy distribution
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

---

### 1f. Error: "We couldn't find this location" (FailedToOpenContainer)

| Field | Detail |
|---|---|
| **Problem** | Policy shows **"We couldn't find this location"**. |
| **Root Cause** | The location (mailbox, site, group) no longer exists. It may have been deleted after the policy was created. |
| **Resolution** | Remove the non-existent location from the policy: |

```powershell
Set-RetentionCompliancePolicy -Identity "<policy name>" -RemoveSharePointLocation "https://contoso.sharepoint.com/sites/deleted-site"
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

---

### 1g. Error: "We can't process your policy" (ActiveDirectorySyncError)

| Field | Detail |
|---|---|
| **Problem** | Policy shows **"We can't process your policy"**. |
| **Root Cause** | The policy didn't sync with Microsoft Entra ID. This is commonly a transient Azure AD/Entra ID synchronization issue. |
| **Resolution** | Retry distribution: |

```powershell
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

---

### 1h. Error: "We're still processing your policy" (PolicySyncTimeout)

| Field | Detail |
|---|---|
| **Problem** | Policy stuck in pending state with **"We're still processing your policy"**. |
| **Root Cause** | Policy sync didn't finish within the expected timeframe. Can occur in large tenants or during service incidents. |
| **Resolution** | Retry distribution: |

```powershell
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

---

### 1i. Error: "You can't apply a hold here" (RecipientTypeNotAllowed)

| Field | Detail |
|---|---|
| **Problem** | Adding a location to a policy fails with **"You can't apply a hold here"**. |
| **Root Cause** | Unsupported mailbox type added (e.g., `RoomMailbox`, `DiscoveryMailbox`) to a retention policy location that doesn't support it. |
| **Resolution** | Remove the unsupported mailbox from the policy locations and retry. |

---

## 2. Retention Policy Not Taking Effect / Delayed Application

| Field | Detail |
|---|---|
| **Problem** | Retention policy created but content is not being retained or deleted as expected. Customers report policies "not working" after creation. |
| **Root Cause** | Retention policies take **up to 7 days** to fully distribute and take effect. The timer jobs that enforce retention run periodically (every 1–7 days for Exchange, every 7 days for SharePoint). |
| **Resolution** | 1. Wait up to 7 days for initial distribution.<br>2. Verify policy status in the portal or via PowerShell.<br>3. For Exchange, ensure the mailbox has **at least 10 MB** of data (retention won't apply below this threshold).<br>4. For SharePoint, ensure the site is **indexed** and not locked. |

```powershell
# Check policy distribution status
Get-RetentionCompliancePolicy -Identity "<policy name>" -DistributionDetail | FL DistributionStatus

# Check detailed distribution results
Get-RetentionCompliancePolicy -Identity "<policy name>" -DistributionDetail | Select -ExpandProperty DistributionResults
```

---

## 3. SharePoint / OneDrive — Preservation Hold Library & Storage Issues

| Field | Detail |
|---|---|
| **Problem** | SharePoint site storage grows unexpectedly. Users can't delete sites or libraries. "This item can't be deleted" errors appear. OneDrive accounts can't be cleaned up after user departure. |
| **Root Cause** | The **Preservation Hold library** stores copies of retained content and counts against the site's storage quota. The timer job runs every 7 days, and content stays in the Preservation Hold library for at least 30 days before cleanup. When combined with the 93-day second-stage Recycle Bin, total delay can be up to **37 days** before content is permanently removed. |
| **Resolution** | 1. Increase site storage quota.<br>2. Do NOT manually delete/edit items in the Preservation Hold library — it is not supported.<br>3. Use **Priority Cleanup** to override holds for specific scenarios (e.g., Teams meeting recordings).<br>4. After releasing a retention policy, allow **30-day grace period** before content in the Preservation Hold library is cleaned up. |

```powershell
# Check Preservation Hold library size (via PnP PowerShell)
Connect-PnPOnline -Url "https://contoso.sharepoint.com/sites/target" -Interactive
Get-PnPList -Identity "Preservation Hold Library" | Select Title, ItemCount

# Check site storage quota
Get-SPOSite -Identity "https://contoso.sharepoint.com/sites/target" | Select StorageQuota, StorageUsageCurrent
```

---

## 4. Exchange Online — Mailbox Retention Issues

| Field | Detail |
|---|---|
| **Problem** | Emails not being deleted at end of retention period. Inactive mailboxes not being cleaned up. Recoverable Items folder growing. |
| **Root Cause** | Multiple factors: (1) Timer job runs every 1–7 days. (2) Items stay in Recoverable Items for 14 days after retention expires. (3) Retention from multiple policies stacks (longest wins). (4) eDiscovery holds block permanent deletion. (5) Mailbox must have ≥10 MB for retention to apply. |
| **Resolution** | 1. Verify all retention policies and holds on the mailbox.<br>2. Check for eDiscovery holds.<br>3. For inactive mailboxes, the policy must be explicitly released before the mailbox can be deleted. |

```powershell
# Check all holds on a mailbox
Get-Mailbox -Identity "user@contoso.com" | FL *Hold*,InPlaceHolds

# Check retention policies applied to the mailbox
Get-RetentionCompliancePolicy | Where-Object {$_.ExchangeLocation -like "*user@contoso.com*"}

# List all retention policies
Get-RetentionCompliancePolicy | FL Name, Enabled, DistributionStatus

# Identify type of hold on mailbox
Get-MailboxFolderStatistics -Identity "user@contoso.com" -FolderScope RecoverableItems | 
    Select Name, FolderAndSubfolderSize, ItemsInFolderAndSubfolders
```

---

## 5. Teams Retention — Messages Not Being Deleted / Unexpected Deletion

| Field | Detail |
|---|---|
| **Problem** | (A) Teams messages not deleted after retention period ends. (B) Messages unexpectedly deleted for users in other orgs or with different policies. |
| **Root Cause** | **(A)** Deleted messages go to `SubstrateHolds` folder (hidden in Exchange mailbox). They remain at least 1 day, then timer job runs every 1–7 days. A delete action after 1 day can take up to **16 days** for permanent deletion. Other holds (eDiscovery, Litigation Hold) suspend permanent deletion. **(B)** When a retention policy deletes a message, the Azure chat service sends a delete command to the Teams client for **all users** in the conversation — even users in other orgs. Copies remain in their mailboxes for eDiscovery but vanish from the Teams UI. |
| **Resolution** | 1. Use eDiscovery to verify if items are actually retained (the Teams UI is not an accurate reflection).<br>2. Ensure no conflicting holds exist.<br>3. For cross-org deletion behavior, this is by design — inform users that eDiscovery can still find the messages. |

```powershell
# Check if mailbox has Teams retention policy applied
Get-RetentionCompliancePolicy | Where-Object {$_.TeamsChannelLocation -ne $null -or $_.TeamsChatLocation -ne $null} | 
    FL Name, TeamsChannelLocation, TeamsChatLocation, Enabled

# Check SubstrateHolds folder for retained Teams messages
Get-MailboxFolderStatistics -Identity "user@contoso.com" -FolderScope RecoverableItems | 
    Where-Object {$_.Name -like "*SubstrateHolds*"} | 
    Select Name, ItemsInFolderAndSubfolders, FolderAndSubfolderSize
```

---

## 6. Teams Private Channel Migration Impact (2025)

| Field | Detail |
|---|---|
| **Problem** | Post-migration, existing `Teams private channel messages` retention policies may conflict with `Teams channel messages` policies applied to the same parent teams, causing unexpected retention behavior. |
| **Root Cause** | Teams is migrating private channel message storage from **user mailboxes** to **group mailboxes** (same as standard/shared channels). Post-migration, `Teams channel messages` location applies to ALL channel types. Existing `Teams private channel messages` policies still enforce but may overlap. |
| **Resolution** | 1. Create new retention policies for `Teams channel messages` that apply specifically to parent teams with private channels if different retention settings are needed.<br>2. Edit existing `Teams channel messages` policies to exclude teams with private channels that need different settings.<br>3. Old `Teams private channel messages` policies continue to work but can't be edited post-migration. |

---

## 7. Auto-Apply Retention Labels Not Working

| Field | Detail |
|---|---|
| **Problem** | Auto-apply retention label policy not labeling content as expected. Labels not appearing on items. |
| **Root Cause** | Multiple possible causes: (1) Takes up to 7 days to take effect. (2) Content already has a retention label (auto-apply **never** replaces existing labels). (3) For trainable classifiers, SharePoint/OneDrive items older than 6 months can't be auto-labeled. (4) Custom SIT types can't auto-label existing items in SharePoint/OneDrive. (5) Adaptive scopes not supported with trainable classifiers. (6) For Exchange with SIT-based policies, applies to sent/received mail — not already-stored mail. |
| **Resolution** | 1. Check policy status for errors.<br>2. Use **simulation mode** to validate before turning on.<br>3. Verify items don't already have a label applied.<br>4. Use Content Search with the `ComplianceTag` condition to verify labeling.<br>5. If status shows `Off (Error)`, retry distribution. |

```powershell
# Retry a failed auto-apply label policy
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution

# Check the status of auto-apply policies
Get-RetentionCompliancePolicy | Where-Object {$_.Type -eq "AutoApply"} | FL Name, DistributionStatus, Enabled

# Find items with a specific retention label
# (Use Content Search in the Purview portal with condition: Retention label = "label name")

# Get label GUID for KQL queries
Get-Label | Format-Table -Property DisplayName, Name, Guid
```

**Key Limitations to Communicate:**
- An auto-apply policy will **never** replace an existing retention label on content.
- Trainable classifiers **cannot** be used with adaptive scopes — use static scopes instead.
- Max 20,000 locations for simulation with adaptive scopes.
- Max 100 item samples per mailbox in simulation.

> **MCP Diagnostic Reference:** For step-by-step automated diagnostics, see [auto-apply-labels.md](dlm-diagnostics/references/auto-apply-labels.md). Note: `Get-Label` and `Get-AppRetentionCompliancePolicy` are not available via the MCP tool and must be executed manually.

---

## 8. Retention Label Policy — "Off (Error)" Status

| Field | Detail |
|---|---|
| **Problem** | Auto-apply label policy shows status **"Off (Error)"** in the portal. For SharePoint, the message says "it's taking longer than expected to deploy the policy." For OneDrive, it says "try redeploying the policy." |
| **Root Cause** | Policy distribution failed — possibly due to service timeouts, transient errors, or location-specific issues. |
| **Resolution** | Retry the distribution: |

```powershell
Connect-IPPSSession
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution
```

> **MCP Diagnostic Reference:** For step-by-step automated diagnostics, see [auto-apply-labels.md](dlm-diagnostics/references/auto-apply-labels.md).

---

## 9. Disposition Review Problems

| Field | Detail |
|---|---|
| **Problem** | (A) Reviewers not receiving disposition email notifications. (B) Reviewers can't see items in the Disposition page. (C) Items pending disposition for too long. (D) Can't see content in mini-preview pane. |
| **Root Cause** | **(A)** Reviewers must be assigned the **Disposition Management** role. Only members of mail-enabled security groups receive notifications (not the group owner). Microsoft 365 groups are NOT supported — must use mail-enabled security groups. **(B)** By default, reviewers see only items assigned to them. Admins must enable a mail-enabled security group in Records Management settings to see all items. **(C)** Items never permanently delete from Recoverable Items until disposition is confirmed. **(D)** User needs the **Content Explorer Content Viewer** role to preview content. |
| **Resolution** | 1. Verify role assignments.<br>2. Enable the security group for disposition.<br>3. Use auto-approval (7-365 days) to prevent items from being stuck indefinitely. |

```powershell
# Enable an additional security group for disposition review
Enable-ComplianceTagStorage -RecordsManagementSecurityGroupEmail "dispositionreviewers@contoso.com"

# Check auditing is enabled (required for disposition)
Get-AdminAuditLogConfig | FL UnifiedAuditLogIngestionEnabled
```

**Key Limits:**
- Max 10 reviewers per disposition stage
- Max 200 reviewers per tenant
- Max 5 stages per disposition review
- Max 16,000,000 items in pending/approved disposition per tenant
- Proof of disposition retained for up to 7 years

---

## 10. Adaptive Scope — Query Not Targeting Correct Users/Sites

| Field | Detail |
|---|---|
| **Problem** | Adaptive scope includes wrong users/sites or excludes expected ones. Scope membership doesn't match expectations. |
| **Root Cause** | (1) Incorrect attribute values typed in query (no validation at entry time). (2) Using wrong OPATH property or KQL syntax. (3) For hybrid environments, unlicensed synced user accounts without Exchange mailboxes inflate counts. (4) Arbitration mailboxes appear in scope details but not in PowerShell validation. (5) SharePoint custom site properties (RefinableString00-99) not mapped correctly. |
| **Resolution** | 1. Validate queries independently using PowerShell or SharePoint search **before** assigning to policies.<br>2. Use the advanced query builder for complex scenarios.<br>3. Review scope membership details in the portal (Settings → Roles and scopes → Adaptive scopes). |

```powershell
# Validate a User scope query
Get-Recipient -RecipientTypeDetails UserMailbox,MailUser -Filter {Department -eq "Marketing"} -ResultSize Unlimited

# Validate a User scope with email exclusion
Get-Mailbox -RecipientTypeDetails UserMailbox -Filter {EmailAddresses -notlike "smtp:admin@contoso.com"} -ResultSize Unlimited

# Validate a Microsoft 365 Group scope
Get-Mailbox -RecipientTypeDetails GroupMailbox -Filter {CustomAttribute15 -eq "Marketing"} -ResultSize Unlimited

# Check for unlicensed/non-mailbox users inflating counts
Get-User -RecipientTypeDetails User

# Target only inactive mailboxes (advanced query)
# OPATH: (IsInactiveMailbox -eq "True")
# Exclude inactive mailboxes:
# OPATH: (IsInactiveMailbox -eq "False")

# Validate SharePoint adaptive scope (run from SharePoint)
# Navigate to: https://<tenant>.sharepoint.com/search
# Enter your KQL query, e.g.: SiteTemplate=SITEPAGEPUBLISHING

# Export scope membership
Get-AdaptiveScopeMembers -Identity "<scope name>"
```

**Key OPATH Operators for Advanced Query Builder:**
- `eq`, `ne`, `lt`, `gt`, `like`, `notlike`, `and`, `or`, `not`

**Key KQL Site Templates:**
| Template | Site Type |
|---|---|
| `SITEPAGEPUBLISHING` | Modern communication sites |
| `GROUP` | Microsoft 365 group-connected sites |
| `TEAMCHANNEL` | Teams private channel sites |
| `STS` | Classic SharePoint team sites |
| `SPSPERS` | OneDrive sites |

> **MCP Diagnostic Reference:** For step-by-step automated diagnostics, see [adaptive-scope.md](dlm-diagnostics/references/adaptive-scope.md).

---

## 11. Adaptive Scope — Delayed Membership Population

| Field | Detail |
|---|---|
| **Problem** | Newly created adaptive scope shows no members or incorrect members. Policy reports no locations found. |
| **Root Cause** | Adaptive scope queries run **once daily** against Microsoft Entra ID or SharePoint. It can take **up to 5 days** for queries to fully populate. Creating a policy immediately after creating a scope may result in an empty scope. |
| **Resolution** | 1. Wait **at least 3–5 days** after creating an adaptive scope before adding it to a policy.<br>2. Verify scope membership via the portal or PowerShell before assigning to policies.<br>3. For simulation mode with adaptive scopes, confirm membership before starting simulation. |

```powershell
# View adaptive scope membership
Get-AdaptiveScopeMembers -Identity "<scope name>"

# Check scope details in portal:
# Settings → Roles and scopes → Adaptive scopes → Select scope → Scope details
```

**Maximums for Adaptive Scopes:**
| Limit | Value |
|---|---|
| String length for attribute values | 200 chars |
| Attributes per group or without group | 10 |
| Number of groups | 10 |
| Advanced query characters | 10,000 |
| Members displayed in scope details | 1,000,000 |

> **MCP Diagnostic Reference:** For step-by-step automated diagnostics, see [adaptive-scope.md](dlm-diagnostics/references/adaptive-scope.md).

---

## 12. Adaptive Scope — Trainable Classifiers Not Supported

| Field | Detail |
|---|---|
| **Problem** | Cannot create an auto-apply retention label policy using both trainable classifiers **and** adaptive scopes. |
| **Root Cause** | This is a **known limitation** — trainable classifiers for auto-labeling are not currently supported with adaptive scopes. |
| **Resolution** | Use a **static scope** instead of an adaptive scope when configuring auto-apply policies with trainable classifiers. |

> **MCP Diagnostic Reference:** For step-by-step automated diagnostics, see [adaptive-scope.md](dlm-diagnostics/references/adaptive-scope.md) and [auto-apply-labels.md](dlm-diagnostics/references/auto-apply-labels.md).

---

## 13. Policy Limits Exceeded

| Field | Detail |
|---|---|
| **Problem** | Cannot create new retention policies. Errors when adding locations. Performance degradation on mailboxes. |
| **Root Cause** | Tenant-wide and per-workload limits exceeded. |
| **Resolution** | Review and consolidate policies. Use adaptive scopes to reduce the number of policies needed. |

**Key Limits:**

| Limit | Maximum |
|---|---|
| Total policies per tenant (all types) | 10,000 |
| Retention labels per tenant | 1,000 |
| Exchange policies (any config) | 1,800 |
| Policies per mailbox (recommended) | 25 (50 supported) |
| SharePoint/OneDrive (all sites auto-included) | 13 |
| SharePoint/OneDrive (specific locations) | 2,600 |
| Static scope: Exchange mailboxes per policy | 1,000 |
| Static scope: SharePoint sites per policy | 100 |
| Static scope: OneDrive accounts per policy | 100 |
| Static scope: M365 Groups per policy | 500 |

```powershell
# Count current retention policies
(Get-RetentionCompliancePolicy).Count

# List all retention policies with status
Get-RetentionCompliancePolicy | FL Name, Enabled, Type, DistributionStatus
```

---

## 14. Policy Stuck in PendingDeletion

| Field | Detail |
|---|---|
| **Problem** | Attempting to delete a retention policy fails. Policy remains in `PendingDeletion` state indefinitely. |
| **Root Cause** | Unspecified error during policy deletion process. May be caused by dependent rules, active holds, or sync issues. |
| **Resolution** | Force delete via PowerShell: |

```powershell
Remove-RetentionCompliancePolicy -Identity "<policy name>" -ForceDeletion
```

---

## 15. Conflicts Between Multiple Retention Policies / Labels

| Field | Detail |
|---|---|
| **Problem** | Content is retained longer than expected, or not being deleted when expected. Unexpected retention behavior when multiple policies apply. |
| **Root Cause** | The **Principles of Retention** determine behavior when multiple policies/labels apply to the same content. These operate as tie-breakers in order: (1) **Retention wins over deletion** — content can't be permanently deleted while any retain action applies. (2) **Longest retention period wins** — among all retain actions, the longest period applies. (3) **Explicit wins over implicit for deletions** — retention label delete action takes precedence over retention policy delete action; scoped policies take precedence over org-wide policies. (4) **Shortest deletion period wins** — if all else is equal, the shortest delete period applies. |
| **Resolution** | 1. Use **Policy Lookup** in the Purview portal to identify all policies applied to a specific user/site/group.<br>2. Understand that you cannot override the principles of retention (except via Priority Cleanup).<br>3. Use Priority Cleanup to override holds for exceptional scenarios. |

```powershell
# Check all policies applied to a specific mailbox
# Use Policy Lookup in: Microsoft Purview portal → Data Lifecycle Management → Policy lookup

# List all retention policies affecting a user
Get-RetentionCompliancePolicy | ForEach-Object {
    $policy = $_
    $detail = Get-RetentionCompliancePolicy -Identity $policy.Name -DistributionDetail
    if ($detail.ExchangeLocation -contains "All" -or $detail.ExchangeLocation -like "*user@contoso.com*") {
        [PSCustomObject]@{
            PolicyName = $policy.Name
            Enabled    = $policy.Enabled
            Status     = $detail.DistributionStatus
        }
    }
}
```

---

## General Diagnostic PowerShell Commands

```powershell
# =============================================
# CONNECT TO SECURITY & COMPLIANCE POWERSHELL
# =============================================
Install-Module -Name ExchangeOnlineManagement -Force
Connect-IPPSSession

# =============================================
# LIST ALL RETENTION POLICIES
# =============================================
Get-RetentionCompliancePolicy | FL Name, Type, Enabled, Mode, DistributionStatus

# =============================================
# CHECK SPECIFIC POLICY DISTRIBUTION STATUS
# =============================================
Get-RetentionCompliancePolicy -Identity "<policy name>" -DistributionDetail | FL DistributionStatus
Get-RetentionCompliancePolicy -Identity "<policy name>" -DistributionDetail | Select -ExpandProperty DistributionResults

# =============================================
# CHECK APP-BASED POLICIES (Teams private, Viva Engage)
# =============================================
Get-AppRetentionCompliancePolicy -Identity "<policy name>" -DistributionDetail | FL DistributionStatus
Get-AppRetentionCompliancePolicy -Identity "<policy name>" -DistributionDetail | Select -ExpandProperty DistributionResults

# =============================================
# RETRY FAILED POLICY DISTRIBUTION
# =============================================
Set-RetentionCompliancePolicy -Identity "<policy name>" -RetryDistribution

# =============================================
# FORCE DELETE A STUCK POLICY
# =============================================
Remove-RetentionCompliancePolicy -Identity "<policy name>" -ForceDeletion

# =============================================
# LIST ALL RETENTION LABELS
# =============================================
Get-ComplianceTag | FL Name, RetentionAction, RetentionDuration, IsRecordLabel

# =============================================
# CHECK MAILBOX HOLDS
# =============================================
Get-Mailbox -Identity "user@contoso.com" | FL LitigationHoldEnabled, InPlaceHolds, RetentionPolicy

# =============================================
# CHECK RECOVERABLE ITEMS FOLDER SIZE
# =============================================
Get-MailboxFolderStatistics -Identity "user@contoso.com" -FolderScope RecoverableItems |
    Select Name, FolderAndSubfolderSize, ItemsInFolderAndSubfolders

# =============================================
# VALIDATE ADAPTIVE SCOPE QUERIES
# =============================================
Get-Recipient -RecipientTypeDetails UserMailbox,MailUser -Filter {Department -eq "Marketing"} -ResultSize Unlimited
Get-Mailbox -RecipientTypeDetails GroupMailbox -Filter {CustomAttribute15 -eq "Legal"} -ResultSize Unlimited

# =============================================
# VIEW ADAPTIVE SCOPE MEMBERS
# =============================================
Get-AdaptiveScopeMembers -Identity "<scope name>"

# =============================================
# CHECK PRESERVATION HOLD LIBRARY (PnP)
# =============================================
Connect-PnPOnline -Url "https://contoso.sharepoint.com/sites/target" -Interactive
Get-PnPList -Identity "Preservation Hold Library" | Select Title, ItemCount
```

---

## Best Practices to Prevent Escalations

1. **Wait for policy distribution** — Always wait up to 7 days before troubleshooting. Check `DistributionStatus` before making changes.
2. **Don't update policies in pending state** — Wait until status is no longer "Pending" before making further changes.
3. **Batch location updates** — Use single bulk PowerShell commands to add multiple locations instead of running individual updates.
4. **Use adaptive scopes** — They remove per-policy item limits and dynamically adjust to organizational changes.
5. **Validate adaptive scope queries** — Always validate queries via PowerShell or SharePoint search before assigning to policies. Wait 3–5 days for full population.
6. **Plan for storage impact** — The Preservation Hold Library consumes site quota. Budget additional SharePoint storage for retention.
7. **Use Policy Lookup** — Regularly audit which policies apply to which locations to prevent conflicts.
8. **Use simulation mode** — For auto-apply label policies, run simulation first to validate accuracy before turning on.
9. **Understand the Principles of Retention** — Educate stakeholders that retention always wins over deletion, and the longest retention period wins.
10. **Use Priority Cleanup** — For exceptional scenarios where you need to override holds (e.g., large Teams recordings consuming storage).

---

---

## 16. Archive Mailboxes — Enabling, Expanding, and Items Not Moving

### 16a. Cannot Enable Archive Mailbox

| Field | Detail |
|---|---|
| **Problem** | Admin attempts to enable an archive mailbox for a user but the option is unavailable or the command fails. |
| **Root Cause** | (1) The user does not have the correct license (Exchange Online Plan 2, or Exchange Online Plan 1 with Exchange Online Archiving add-on). (2) The admin does not have the **Mail Recipients** role assigned in Exchange Online. (3) The mailbox was previously disabled and the archive was disconnected more than 30 days ago — the `DisabledArchiveGuid` contains a stale GUID causing error `MissingDisconnectReceiptsException`. |
| **Resolution** | 1. Verify the user has the correct license assigned.<br>2. Ensure the admin has the **Mail Recipients** role (assigned to Recipient Management or Organization Management role groups by default).<br>3. For the 30-day stale archive error, run `Set-Mailbox` with `-RemoveDisabledArchive`, then re-enable. |

```powershell
# Check if user has an archive mailbox
Get-Mailbox -Identity "user@contoso.com" | FL ArchiveStatus, ArchiveGuid, DisabledArchiveGuid

# Enable archive mailbox for a single user
Enable-Mailbox -Identity "user@contoso.com" -Archive

# Enable archive for ALL users who don't have one
Get-Mailbox -Filter {ArchiveGuid -Eq "00000000-0000-0000-0000-000000000000" -AND DisabledArchiveGuid -Eq "00000000-0000-0000-0000-000000000000" -AND RecipientTypeDetails -Eq "UserMailbox"} | Enable-Mailbox -Archive

# Fix stale disconnected archive (30+ days)
Set-Mailbox -Identity "user@contoso.com" -RemoveDisabledArchive
Enable-Mailbox -Identity "user@contoso.com" -Archive

# Auto-enable archive at 90% quota for the org
Set-OrganizationConfig -AutoEnableArchiveMailbox $true
```

---

### 16b. Auto-Expanding Archive Not Provisioning Additional Storage

| Field | Detail |
|---|---|
| **Problem** | Archive mailbox reaches 100 GB quota but auto-expanding archive does not provision additional storage space. Items fail to move or mailbox stops accepting archive moves. |
| **Root Cause** | (1) Auto-expanding archiving is not enabled for the mailbox or organization. (2) Additional storage provisioning can take **up to 30 days** after the archive reaches its quota. (3) Mailbox growth rate exceeds the supported limit of **1 GB per day**. (4) Journaling, transport rules, or auto-forwarding are being used to copy messages to the archive (not permitted). (5) Total auto-expanding archive has already reached the **1.5 TB maximum**. |
| **Resolution** | 1. Verify auto-expanding archiving is enabled at org or mailbox level.<br>2. Wait up to 30 days for provisioning.<br>3. Check if the mailbox growth rate exceeds 1 GB/day.<br>4. If 1.5 TB is reached, implement retention policies to delete content that no longer has business value. |

```powershell
# Check if auto-expanding is enabled for the org
Get-OrganizationConfig | FL AutoExpandingArchiveEnabled

# Enable auto-expanding archiving for the entire org
Set-OrganizationConfig -AutoExpandingArchive

# Enable auto-expanding archiving for a specific mailbox
Enable-Mailbox -Identity "user@contoso.com" -AutoExpandingArchive

# Check archive mailbox size and auto-expand status
Get-Mailbox -Identity "user@contoso.com" | FL ArchiveStatus, AutoExpandingArchiveEnabled, ArchiveQuota, ArchiveWarningQuota

# Check archive mailbox statistics
Get-MailboxStatistics -Identity "user@contoso.com" -Archive | FL DisplayName, TotalItemSize, ItemCount
```

**Key Limitations of Auto-Expanding Archives:**
| Limitation | Detail |
|---|---|
| Maximum total auto-expand size | 1.5 TB |
| Maximum growth rate | 1 GB per day |
| Folder deletion | Users cannot delete any folder from archive after auto-expand provisioning |
| Item recovery | Users cannot use "Recover Deleted Items" after auto-expand is enabled |
| Item counts | Item counts and Read/Unread counts may not be accurate |
| Search (classic Outlook) | Restricted to the current Outlook search scope |
| Cloud-only archive search | Not supported when primary mailbox is still on-premises |

---

### 16c. Items Not Moving to Archive Mailbox

| Field | Detail |
|---|---|
| **Problem** | Items remain in the primary mailbox and are not moved to the archive, even after archive is enabled and retention tags are configured. |
| **Root Cause** | (1) The **Managed Folder Assistant (MFA)** has not yet processed the mailbox — it is throttle-based and runs periodically. (2) The default MRM archive policy moves items only after **2 years** (730 days). (3) No MRM retention policy with a **Move to Archive** tag is assigned to the mailbox. (4) The mailbox is on **Retention Hold** which suspends MFA processing. (5) Items exceed `MaxSendSize` or `MaxReceiveSize` values set on the mailbox — MRM won't move oversized items. (6) The archive mailbox is not enabled for the user. |
| **Resolution** | 1. Verify archive is enabled.<br>2. Confirm the correct MRM policy with "Move to Archive" tag is assigned.<br>3. Check if Retention Hold is enabled.<br>4. Manually trigger MFA to process the mailbox.<br>5. Wait for MFA to process (can take up to 7 days). |

```powershell
# Check retention policy assigned to mailbox
Get-Mailbox -Identity "user@contoso.com" | FL RetentionPolicy, RetentionHoldEnabled, ArchiveStatus

# View retention tags in the assigned policy
$policy = (Get-Mailbox -Identity "user@contoso.com").RetentionPolicy
Get-RetentionPolicyTag -Mailbox "user@contoso.com" | FL Name, Type, RetentionAction, AgeLimitForRetention, RetentionEnabled

# Manually trigger Managed Folder Assistant
Start-ManagedFolderAssistant -Identity "user@contoso.com"

# Check mailbox size limits that block MRM
Get-Mailbox -Identity "user@contoso.com" | FL MaxSendSize, MaxReceiveSize

# Check if Retention Hold is blocking processing
Get-Mailbox -Identity "user@contoso.com" | FL RetentionHoldEnabled, StartDateForRetentionHold, EndDateForRetentionHold

# Disable Retention Hold
Set-Mailbox -Identity "user@contoso.com" -RetentionHoldEnabled $false
```

---

### 16d. Archive Mailbox Disabled — Content Lost After 30 Days

| Field | Detail |
|---|---|
| **Problem** | Admin disables a user's archive mailbox. After 30+ days, attempts to re-enable the archive result in an empty archive; original content is permanently deleted. |
| **Root Cause** | When an archive mailbox is disabled, its contents are retained for only **30 days**. After 30 days the original archive content is permanently deleted and cannot be recovered. Re-enabling after 30 days creates a brand-new, empty archive. |
| **Resolution** | 1. If within 30 days: re-enable the archive to reconnect to the original content.<br>2. If beyond 30 days: the content is permanently lost. No recovery is possible.<br>3. **Preventive:** Communicate to admins never to disable archive mailboxes unless absolutely intended. |

```powershell
# Re-enable archive (must be within 30 days of disabling)
Enable-Mailbox -Identity "user@contoso.com" -Archive

# Disable archive (WARNING: content deleted after 30 days)
Disable-Mailbox -Identity "user@contoso.com" -Archive
```

---

### 16e. Run Archive Mailbox Diagnostics

| Field | Detail |
|---|---|
| **Problem** | General archive mailbox issues — need automated diagnostics. |
| **Root Cause** | Various archive configuration or provisioning issues. |
| **Resolution** | Use the Microsoft 365 Admin Center automated diagnostic: Navigate to [https://aka.ms/PillarArchiveMailbox](https://aka.ms/PillarArchiveMailbox), enter the user's email address, and click **Run Tests**. Requires Global Admin role. Not available in GCC, 21Vianet, or Germany clouds. |

---

## 17. Inactive Mailboxes — Creating, Recovering, Restoring, and Deleting

### 17a. Mailbox Not Converting to Inactive After User Account Deletion

| Field | Detail |
|---|---|
| **Problem** | Admin deletes a user account expecting the mailbox to become inactive, but the mailbox is permanently deleted after 30 days instead. |
| **Root Cause** | No hold was applied to the mailbox **before** the user account was deleted. A mailbox only converts to inactive if at least one hold (Microsoft 365 retention policy, retention label, Litigation Hold, or eDiscovery hold) is applied before account deletion. If the retention action is configured to **delete-only** (no retain action), the mailbox also won't become inactive. |
| **Resolution** | 1. **Before deleting a user account:** Always apply a hold first and confirm it is applied.<br>2. Use Microsoft 365 retention policies with **Retain** or **Retain and then delete** actions.<br>3. Wait for the retention settings to be applied before deleting the account.<br>4. Confirm the hold using PowerShell. |

```powershell
# Confirm hold is applied BEFORE deleting user
Get-Mailbox -Identity "user@contoso.com" | FL LitigationHoldEnabled, InPlaceHolds, RetentionPolicy

# Identify type of hold on a mailbox
Get-Mailbox -Identity "user@contoso.com" | FL *Hold*

# Check if ComplianceTagHoldApplied (retention labels with retain action)
Get-Mailbox -Identity "user@contoso.com" | FL ComplianceTagHoldApplied

# Apply Litigation Hold before deleting user
Set-Mailbox -Identity "user@contoso.com" -LitigationHoldEnabled $true

# List all inactive mailboxes in the org
Get-Mailbox -InactiveMailboxOnly -ResultSize Unlimited | FT DisplayName, PrimarySmtpAddress, WhenSoftDeleted

# Export inactive mailbox list to CSV
Get-Mailbox -InactiveMailboxOnly -ResultSize Unlimited | Select DisplayName, PrimarySmtpAddress, DistinguishedName, ExchangeGuid, WhenSoftDeleted | Export-Csv InactiveMailboxes.csv -NoTypeInformation
```

---

### 17b. Cannot Recover or Restore an Inactive Mailbox with Auto-Expanding Archive

| Field | Detail |
|---|---|
| **Problem** | Admin attempts to recover or restore an inactive mailbox, but the operation fails because the mailbox has an auto-expanding archive. |
| **Root Cause** | **By design**, inactive mailboxes configured with an auto-expanding archive **cannot** be recovered or restored using `New-Mailbox -InactiveMailbox` or `New-MailboxRestoreRequest`. This is a known limitation. |
| **Resolution** | Use **Content Search** (eDiscovery) to export the data from the inactive mailbox. This is the only supported method. |

```powershell
# Check if inactive mailbox has auto-expanding archive
Get-Mailbox -InactiveMailboxOnly -Identity "user@contoso.com" | FL AutoExpandingArchiveEnabled

# If AutoExpandingArchiveEnabled is True:
# Use Content Search in Microsoft Purview portal to export data
# 1. Go to Microsoft Purview portal → eDiscovery → Content Search
# 2. Create a new search targeting the inactive mailbox
# 3. Export the search results
```

**References:**
- [Content Search](https://learn.microsoft.com/en-us/purview/ediscovery-content-search)
- [Export Content Search Results](https://learn.microsoft.com/en-us/purview/ediscovery-export-search-results)

---

### 17c. Recovering an Inactive Mailbox — Soft-Delete Period Not Expired

| Field | Detail |
|---|---|
| **Problem** | Admin tries to recover an inactive mailbox using `New-Mailbox -InactiveMailbox` but gets an error. The mailbox was soft-deleted less than 30 days ago. |
| **Root Cause** | If the user account was deleted less than **30 days** ago, the `ExternalDirectoryObjectId` is still populated. In this case, you must recover by restoring the user account (undeletion) in Microsoft 365 Admin Center, not by using `New-Mailbox -InactiveMailbox`. |
| **Resolution** | 1. Check if the soft-delete period has expired.<br>2. If within 30 days: restore the user account via Microsoft 365 Admin Center.<br>3. If beyond 30 days: use `New-Mailbox -InactiveMailbox`. |

```powershell
# Check if soft-delete period has expired
Get-Mailbox -InactiveMailboxOnly -Identity "user@contoso.com" | FL ExternalDirectoryObjectId
# If ExternalDirectoryObjectId has a value → soft-delete period NOT expired → restore user account
# If ExternalDirectoryObjectId is empty → soft-delete period expired → use New-Mailbox -InactiveMailbox

# Recover inactive mailbox (only when soft-delete period has expired)
$InactiveMailbox = Get-Mailbox -InactiveMailboxOnly -Identity "user@contoso.com"
New-Mailbox -InactiveMailbox $InactiveMailbox.ExchangeGuid -Name "Ann Beebe" -FirstName Ann -LastName Beebe -DisplayName "Ann Beebe" -MicrosoftOnlineServicesID Ann.Beebe@contoso.com -Password (ConvertTo-SecureString -String 'P@ssw0rd' -AsPlainText -Force) -ResetPasswordOnNextLogon $true
```

---

### 17d. Cannot Delete an Inactive Mailbox — Multiple Holds Conflict

| Field | Detail |
|---|---|
| **Problem** | Admin wants to permanently delete an inactive mailbox but cannot because multiple holds are applied. After removing one hold, the mailbox remains inactive. |
| **Root Cause** | An inactive mailbox can have multiple holds applied simultaneously: Microsoft 365 retention policies (org-wide and specific), retention labels, eDiscovery holds, Litigation Hold, and legacy In-Place Holds. **All** holds must be removed before the mailbox will be permanently deleted. Additionally, if a retention policy uses **Preservation Lock**, the inactive mailbox cannot be removed from that policy. |
| **Resolution** | 1. Identify all holds on the inactive mailbox.<br>2. Remove each hold type using the appropriate method.<br>3. After removing the last hold, the mailbox transitions to soft-deleted and is permanently deleted after 30 days. |

```powershell
# Step 1: Identify ALL holds on the inactive mailbox
Get-Mailbox -InactiveMailboxOnly -Identity "user@contoso.com" | FL Name, DistinguishedName, ExchangeGuid, LitigationHoldEnabled, InPlaceHolds, ComplianceTagHoldApplied

# Step 2a: Remove Litigation Hold
Set-Mailbox -InactiveMailbox -Identity "user@contoso.com" -LitigationHoldEnabled $false

# Step 2b: Remove from org-wide retention policy (static scope)
Set-Mailbox "user@contoso.com" -ExcludeFromOrgHolds <retention policy GUID without prefix or suffix>
# Or exclude from ALL org-wide holds:
Set-Mailbox "user@contoso.com" -ExcludeFromAllOrgHolds

# Step 2c: Remove from specific-inclusion retention policy
Set-RetentionCompliancePolicy -Identity "<policy GUID>" -RemoveExchangeLocation "user@contoso.com"

# Step 2d: Remove from adaptive scope retention policy
# Modify the adaptive scope query to exclude inactive mailboxes:
# Advanced query: IsInactiveMailbox -eq "False"

# Step 2e: Remove legacy In-Place Hold
Invoke-HoldRemovalAction -Action GetHolds -ExchangeLocation "user@contoso.com"
Invoke-HoldRemovalAction -Action RemoveHold -ExchangeLocation "user@contoso.com" -HoldId <hold ID>

# Step 3: Force recalculation if mailbox still shows as inactive after hold removal
Set-Mailbox -Identity "user@contoso.com" -RecalculateInactiveMailbox

# Step 4: Verify mailbox is transitioning to soft-deleted
Get-Mailbox -SoftDeletedMailbox -Identity "user@contoso.com" | FL Name, IsInactiveMailbox, WasInactiveMailbox, InactiveMailboxRetireTime
```

---

### 17e. Inactive Mailbox Has Same SMTP Address as Active Mailbox

| Field | Detail |
|---|---|
| **Problem** | Two mailboxes (one active, one inactive) share the same primary SMTP address, causing ambiguity in PowerShell commands and policy operations. |
| **Root Cause** | When a new user is created with the same email address as a former employee whose mailbox was made inactive, both mailboxes share the SMTP address. This creates conflicts when running `Get-Mailbox` or applying policies by email address. |
| **Resolution** | Use the `DistinguishedName` or `ExchangeGuid` property to uniquely identify the inactive mailbox instead of the SMTP address. |

```powershell
# List inactive mailboxes with unique identifiers
Get-Mailbox -InactiveMailboxOnly -ResultSize Unlimited | Select DisplayName, PrimarySmtpAddress, DistinguishedName, ExchangeGuid

# Use ExchangeGuid to target the correct inactive mailbox
Get-Mailbox -InactiveMailboxOnly -Identity <ExchangeGuid>
```

---

### 17f. UPN/SMTP Change Before Deletion Prevents Future Inactive Mailbox Management

| Field | Detail |
|---|---|
| **Problem** | Admin changed the UPN or primary SMTP address of a mailbox **before** deleting the user account to make it inactive. Now the inactive mailbox cannot be removed from the retention policy because the identity no longer matches. |
| **Root Cause** | When a retention policy is applied to a mailbox using its UPN/SMTP address, the policy stores that identity. If the UPN/SMTP is changed before the account is deleted, the policy reference becomes stale. The admin cannot remove the inactive mailbox from the policy using the new address because it doesn't match what the policy recorded. |
| **Resolution** | **Preventive:** Do NOT change the UPN or primary SMTP address before making a mailbox inactive. If already in this state, contact Microsoft Support for assistance as this requires backend operations. |

---

### 17g. MRM Archive Policies Ignored on Inactive Mailboxes

| Field | Detail |
|---|---|
| **Problem** | Items in an inactive mailbox that are tagged with an MRM archive policy (Move to Archive) are not being moved to the archive mailbox. |
| **Root Cause** | **By design**, MRM retention tags with the `MoveToArchive` action are **ignored** on inactive mailboxes. Items tagged with archive policies remain in the primary mailbox and are retained indefinitely. However, MRM **deletion** policies continue to be processed on inactive mailboxes. |
| **Resolution** | This is expected behavior. If retention is needed on the inactive mailbox, use Microsoft 365 retention policies instead of MRM. |

---

## 18. MRM (Messaging Records Management) — Retention Tags, Policies, and MFA Issues

### 18a. Retention Tags Not Being Applied / MFA Not Processing Mailbox

| Field | Detail |
|---|---|
| **Problem** | Retention tags configured in an MRM retention policy are not being applied to mailbox items. Items are not being moved to archive or deleted according to tag settings. |
| **Root Cause** | (1) The **Managed Folder Assistant (MFA)** has not yet run on the mailbox — it is a throttle-based assistant. (2) The mailbox does not have an MRM retention policy assigned. (3) The mailbox is on **Retention Hold** which suspends MFA processing. (4) Items are larger than `MaxSendSize` or `MaxReceiveSize` — MRM won't move oversized items. (5) Retention tags in the policy are **disabled** (`RetentionEnabled = $false`). |
| **Resolution** | 1. Verify the MRM policy is assigned.<br>2. Check if Retention Hold is enabled.<br>3. Manually trigger MFA.<br>4. Confirm tags are enabled. |

```powershell
# Check which MRM retention policy is assigned to a mailbox
Get-Mailbox -Identity "user@contoso.com" | FL RetentionPolicy

# Check if Retention Hold is blocking MFA processing
Get-Mailbox -Identity "user@contoso.com" | FL RetentionHoldEnabled, StartDateForRetentionHold, EndDateForRetentionHold

# View all retention tags in the assigned policy
Get-RetentionPolicyTag -Mailbox "user@contoso.com" | FL Name, Type, RetentionAction, AgeLimitForRetention, RetentionEnabled

# Manually trigger MFA on a specific mailbox
Start-ManagedFolderAssistant -Identity "user@contoso.com"

# Check if tags are disabled
Get-RetentionPolicyTag | Where-Object {$_.RetentionEnabled -eq $false} | FL Name, RetentionAction, RetentionEnabled
```

---

### 18b. Default MRM Policy Not Assigned to New Mailboxes

| Field | Detail |
|---|---|
| **Problem** | New mailboxes are not getting the Default MRM Policy applied automatically. Items are not being archived after 2 years. |
| **Root Cause** | In Exchange Online, the **Default MRM Policy** is automatically assigned to all new mailboxes. However, if a custom retention policy is assigned at creation time (via provisioning scripts or templates), the default is overridden. Additionally, the Default MRM Policy moves items to archive only if an **archive mailbox is enabled**. If no archive mailbox exists, the Move to Archive action is silently skipped. |
| **Resolution** | 1. Verify the archive mailbox is enabled for the user.<br>2. Confirm the Default MRM Policy (or a custom MRM policy with archive tags) is assigned.<br>3. Enable archive if missing. |

```powershell
# Check which MRM policy is assigned
Get-Mailbox -Identity "user@contoso.com" | FL RetentionPolicy, ArchiveStatus

# View tags in the Default MRM Policy
Get-RetentionPolicy "Default MRM Policy" | FL RetentionPolicyTagLinks

# Assign Default MRM Policy to a mailbox
Set-Mailbox -Identity "user@contoso.com" -RetentionPolicy "Default MRM Policy"

# Enable archive mailbox (required for Move to Archive)
Enable-Mailbox -Identity "user@contoso.com" -Archive

# View all retention tags linked to a policy
Get-RetentionPolicy "Default MRM Policy" | Select -ExpandProperty RetentionPolicyTagLinks | ForEach-Object { Get-RetentionPolicyTag $_ | FL Name, Type, RetentionAction, AgeLimitForRetention }
```

**Default MRM Policy Tags (Exchange Online):**
| Tag Name | Type | Action | Age Limit |
|---|---|---|---|
| Default 2 year move to archive | DPT | Move to Archive | 730 days |
| Recoverable Items 14 days move to archive | RPT (Recoverable Items) | Move to Archive | 14 days |
| Personal 1 year move to archive | Personal | Move to Archive | 365 days |
| Personal 5 year move to archive | Personal | Move to Archive | 1825 days |
| Personal never move to archive | Personal | Move to Archive | Disabled |
| And others... | | | |

---

### 18c. RPT (Retention Policy Tag) for Default Folder Not Working

| Field | Detail |
|---|---|
| **Problem** | A Retention Policy Tag (RPT) assigned to a default folder (e.g., Deleted Items, Sent Items, Inbox) is not processing items in that folder. |
| **Root Cause** | (1) Only **one RPT per default folder** can be linked to a retention policy — if multiple are linked, only the first is applied. (2) RPTs only support **Delete and Allow Recovery** or **Permanently Delete** actions — NOT Move to Archive. (3) Users cannot change RPTs applied to default folders. (4) The tag may be disabled (`RetentionEnabled = $false`). (5) MFA hasn't processed the mailbox yet. |
| **Resolution** | 1. Verify only one RPT per default folder exists in the policy.<br>2. Confirm the RPT action type is supported (Delete only, not Archive).<br>3. Manually trigger MFA. |

```powershell
# List all RPTs in a retention policy
Get-RetentionPolicy "Default MRM Policy" | Select -ExpandProperty RetentionPolicyTagLinks | ForEach-Object {
    Get-RetentionPolicyTag $_ | Where-Object {$_.Type -ne "All" -and $_.Type -ne "Personal"} | FL Name, Type, RetentionAction, AgeLimitForRetention, RetentionEnabled
}

# Check for duplicate RPTs for the same folder type
Get-RetentionPolicyTag | Where-Object {$_.Type -eq "DeletedItems"} | FL Name, RetentionAction, AgeLimitForRetention

# Trigger MFA
Start-ManagedFolderAssistant -Identity "user@contoso.com"
```

---

### 18d. Personal Tags Not Visible to Users in Outlook

| Field | Detail |
|---|---|
| **Problem** | Users cannot see personal retention tags in Outlook or Outlook on the Web. The "Assign Policy" option shows no tags or incomplete tags. |
| **Root Cause** | (1) Personal tags are a **premium feature** requiring an Exchange Enterprise CAL or equivalent. (2) Tags must be linked to the retention policy assigned to the user's mailbox. (3) Users can also opt-in to tags NOT in their policy via OWA settings, but only if the `MyRetentionPolicies` role is assigned in their role assignment policy. |
| **Resolution** | 1. Verify licensing.<br>2. Ensure personal tags are linked to the user's assigned retention policy.<br>3. Verify role assignment if users need access to tags outside their policy. |

```powershell
# Check which personal tags are in the user's MRM policy
$policy = (Get-Mailbox -Identity "user@contoso.com").RetentionPolicy
Get-RetentionPolicy $policy | Select -ExpandProperty RetentionPolicyTagLinks | ForEach-Object {
    Get-RetentionPolicyTag $_ | Where-Object {$_.Type -eq "Personal"} | FL Name, RetentionAction, AgeLimitForRetention
}

# Check user's role assignment policy for MyRetentionPolicies
Get-Mailbox -Identity "user@contoso.com" | FL RoleAssignmentPolicy
Get-RoleAssignmentPolicy "<policy name>" | FL AssignedRoles
```

---

### 18e. Archive Tag on Folder in Archive Resets to Primary Mailbox Tag

| Field | Detail |
|---|---|
| **Problem** | A user applies a personal tag to a folder in the archive mailbox, but the tag reverts to the primary mailbox folder's tag after MFA processes. |
| **Root Cause** | **By design**, if a folder in the archive mailbox has the same name as a folder in the primary mailbox, the archive folder's retention tag is **automatically reset** to match the primary mailbox folder's tag when MFA runs. This applies to both user-created folders and default folders (Inbox, Deleted Items, etc.). |
| **Resolution** | This is expected behavior. Inform users that archive folders with matching names in the primary mailbox will always inherit the primary folder's tag. To apply different retention to archive items, rename the archive folder or use item-level personal tags instead of folder-level tags. |

---

### 18f. Removing vs. Deleting a Retention Tag — Unexpected Item Deletion

| Field | Detail |
|---|---|
| **Problem** | Admin removes or deletes a retention tag from a retention policy and items are unexpectedly deleted or reprocessed. |
| **Root Cause** | **Removing** a tag from a policy: Items already stamped with the tag **continue** to be processed by MFA based on the tag's settings. The tag is just no longer available for new items. **Deleting** a tag entirely: The tag definition is removed from Active Directory, causing MFA to **restamp all items** in every mailbox. Previously tagged items lose their tag and the DPT (Default Policy Tag) is applied instead — which may have a shorter retention period, causing unexpected deletion. |
| **Resolution** | 1. To prevent a tag from being applied: **Disable** the tag rather than removing or deleting it.<br>2. If you must remove, be aware items continue to expire based on existing stamps.<br>3. Never delete a tag unless you understand the impact — DPT will be applied to all previously tagged items. |

```powershell
# Disable a tag (safest approach — items with this tag will NOT be processed)
Set-RetentionPolicyTag -Identity "Tag Name" -RetentionEnabled $false

# Remove a tag from a policy (items already tagged continue processing)
Set-RetentionPolicy -Identity "Policy Name" -RetentionPolicyTagLinks @{Remove="Tag Name"}

# Delete a tag (WARNING: causes full restamp of all mailboxes)
Remove-RetentionPolicyTag -Identity "Tag Name"
```

---

### 18g. Recoverable Items Folder Growing Indefinitely (Hybrid/Hold Scenario)

| Field | Detail |
|---|---|
| **Problem** | The Recoverable Items folder in on-premises mailboxes (Exchange hybrid) grows indefinitely and reaches its quota. MFA does not purge items from the `DiscoveryHolds` folder. |
| **Root Cause** | In hybrid environments, when a **retention hold is configured in Microsoft 365**, the hold GUID is written to the `msExchUserHoldPolicies` attribute and synced back to on-premises AD. When the on-premises MFA processes the mailbox, it finds the hold attribute but **cannot retrieve the hold details** (because they exist only in Exchange Online). To be safe, MFA skips purging items from the `DiscoveryHolds` folder, causing it to grow indefinitely. |
| **Resolution** | Follow the steps in [Recoverable Items folder not emptied for mailbox on litigation or retention hold](https://learn.microsoft.com/en-us/troubleshoot/exchange/antispam-and-protection/recoverable-items-folder-full). |

```powershell
# Check Recoverable Items folder size and oldest item
Get-MailboxFolderStatistics -Identity "user@contoso.com" -IncludeOldestAndNewestItems -FolderScope RecoverableItems | Format-Table Name, OldestItemLastModifiedDate, ItemsInFolder, FolderSize

# Check items in Recoverable Items folders
Get-RecoverableItems "user@contoso.com" -ResultSize Unlimited

# Check msExchUserHoldPolicies on-premises (requires AD module)
Get-ADUser -Identity "user" -Properties msExchUserHoldPolicies | Select msExchUserHoldPolicies
```

---

### 18h. MRM Retention Policy Diagnostic Check

| Field | Detail |
|---|---|
| **Problem** | Need to validate retention policy settings for a specific user's mailbox. |
| **Root Cause** | Various MRM configuration issues. |
| **Resolution** | Use the Microsoft 365 Admin Center automated diagnostic: Navigate to [https://aka.ms/PillarRetentionPolicy](https://aka.ms/PillarRetentionPolicy), enter the user's email address, and click **Run Tests**. Requires a Microsoft 365 administrator account. Not available in GCC, 21Vianet, or Germany clouds. |

---

### 18i. NeverDelete System Tag Cannot Be Removed

| Field | Detail |
|---|---|
| **Problem** | Admin attempts to delete the `NeverDelete` retention tag but it keeps reappearing. |
| **Root Cause** | The `NeverDelete` tag is a **system tag** created automatically by the system. It **cannot be permanently removed** from the tenant. If deleted, it will be automatically recreated. |
| **Resolution** | This is by design. Do not attempt to delete this tag. If you need to restrict user access to this tag, use RBAC (Role-Based Access Control) to control which personal tags users can opt-in to. See [Users can use all personal retention tags regardless of retention policy in Exchange Online](https://support.microsoft.com/topic/749ae47e-e45d-8f5e-0c9f-35289630af6c). |

---

## General Diagnostic Commands — Archive, Inactive Mailboxes, and MRM

```powershell
# =============================================
# ARCHIVE MAILBOX DIAGNOSTICS
# =============================================
# Check archive status
Get-Mailbox -Identity "user@contoso.com" | FL ArchiveStatus, ArchiveGuid, ArchiveQuota, ArchiveWarningQuota, AutoExpandingArchiveEnabled

# Archive mailbox statistics
Get-MailboxStatistics -Identity "user@contoso.com" -Archive | FL DisplayName, TotalItemSize, ItemCount

# Check auto-expand org-wide setting
Get-OrganizationConfig | FL AutoExpandingArchiveEnabled

# Run archive diagnostic: https://aka.ms/PillarArchiveMailbox

# =============================================
# INACTIVE MAILBOX DIAGNOSTICS
# =============================================
# List all inactive mailboxes
Get-Mailbox -InactiveMailboxOnly -ResultSize Unlimited | FT DisplayName, PrimarySmtpAddress, WhenSoftDeleted

# Identify all holds on an inactive mailbox
Get-Mailbox -InactiveMailboxOnly -Identity "user@contoso.com" | FL Name, ExchangeGuid, DistinguishedName, LitigationHoldEnabled, InPlaceHolds, ComplianceTagHoldApplied

# Check if soft-delete period expired
Get-Mailbox -InactiveMailboxOnly -Identity "user@contoso.com" | FL ExternalDirectoryObjectId

# Check formerly inactive (now soft-deleted) mailbox
Get-Mailbox -SoftDeletedMailbox -Identity "user@contoso.com" | FL Name, IsInactiveMailbox, WasInactiveMailbox, InactiveMailboxRetireTime

# Force recalculation of hold status
Set-Mailbox -Identity "user@contoso.com" -RecalculateInactiveMailbox

# =============================================
# MRM / MANAGED FOLDER ASSISTANT DIAGNOSTICS
# =============================================
# Check assigned MRM retention policy
Get-Mailbox -Identity "user@contoso.com" | FL RetentionPolicy, RetentionHoldEnabled

# List all retention policy tags available to a mailbox
Get-RetentionPolicyTag -Mailbox "user@contoso.com" | FL Name, Type, RetentionAction, AgeLimitForRetention, RetentionEnabled

# List all MRM retention policies
Get-RetentionPolicy | FL Name, RetentionPolicyTagLinks

# List all retention policy tags in the org
Get-RetentionPolicyTag | FL Name, Type, RetentionAction, AgeLimitForRetention, RetentionEnabled

# Manually trigger Managed Folder Assistant
Start-ManagedFolderAssistant -Identity "user@contoso.com"

# Check Recoverable Items folder
Get-MailboxFolderStatistics -Identity "user@contoso.com" -IncludeOldestAndNewestItems -FolderScope RecoverableItems | Format-Table Name, OldestItemLastModifiedDate, ItemsInFolder, FolderSize

# Run MRM retention policy diagnostic: https://aka.ms/PillarRetentionPolicy
```

---

## 19. Exchange Online — Items Stuck in SubstrateHolds / Recoverable Items Quota Exceeded

### 19a. Items Stuck in SubstrateHolds Folder and Not Being Purged

| Field | Detail |
|---|---|
| **Problem** | Teams chat messages and other substrate content remain in the `SubstrateHolds` subfolder of the Recoverable Items folder indefinitely. Items are not permanently deleted even after the retention period has expired. |
| **Root Cause** | Permanent deletion from `SubstrateHolds` is **always suspended** if any of the following applies: (1) Another Teams retention policy with a **retain** action applies to the same mailbox. (2) A **Litigation Hold** is enabled on the mailbox. (3) A **delay hold** is active (occurs after removing a hold — lasts 30 days by default). (4) An **eDiscovery hold** is applied to the mailbox. Per the *first principle of retention*, retention always wins over deletion. All holds must be resolved before items are purged. |
| **Resolution** | 1. Identify all holds on the mailbox.<br>2. Remove conflicting holds if they are no longer needed.<br>3. Wait for the delay hold (30 days) to expire after removing a hold.<br>4. Timer jobs run every 1–7 days — allow time after hold removal. |

```powershell
# Check all holds on the mailbox
Get-Mailbox -Identity "user@contoso.com" | FL LitigationHoldEnabled, InPlaceHolds, ComplianceTagHoldApplied, DelayHoldApplied, DelayReleaseHoldApplied

# Check SubstrateHolds folder size and item count
Get-MailboxFolderStatistics -Identity "user@contoso.com" -FolderScope RecoverableItems |
    Where-Object {$_.Name -eq "SubstrateHolds"} |
    Select Name, ItemsInFolderAndSubfolders, FolderAndSubfolderSize

# Check if delay hold is active (set after hold removal)
Get-Mailbox -Identity "user@contoso.com" | FL DelayHoldApplied, DelayReleaseHoldApplied

# Remove delay hold manually (if needed)
Set-Mailbox -Identity "user@contoso.com" -RemoveDelayHoldApplied
Set-Mailbox -Identity "user@contoso.com" -RemoveDelayReleaseHoldApplied

# Identify which Teams retention policies apply
Get-RetentionCompliancePolicy | Where-Object {
    $_.TeamsChatLocation -ne $null -or $_.TeamsChannelLocation -ne $null
} | FL Name, Enabled, TeamsChatLocation, TeamsChannelLocation
```

---

### 19b. Recoverable Items Quota Exceeded — Mailbox Functionality Impacted

| Field | Detail |
|---|---|
| **Problem** | Users cannot delete items. MFA cannot process retention tags. Mailbox audit logging fails. Error messages about Recoverable Items quota being full. |
| **Root Cause** | The Recoverable Items folder has default quotas: **20 GB (warning) / 30 GB (hard limit)** for standard mailboxes. When a mailbox is on Litigation Hold, In-Place Hold, or has a Microsoft 365 retention policy applied, quotas are automatically raised to **90 GB (warning) / 100 GB (hard limit)**. With archiving enabled on a held mailbox, the quota increases further to **95 GB / 105 GB**. However, even with increased quotas, heavy copy-on-write activity (frequent edits to held items) can exhaust the quota. When the hard limit is reached: users can't delete items, MFA can't purge based on retention tags, copy-on-write fails, and audit logging stops. |
| **Resolution** | 1. Check current Recoverable Items size.<br>2. For mailboxes on hold, follow the documented cleanup procedure to remove items from Recoverable Items while preserving compliance.<br>3. Enable archiving to get the additional 5 GB quota headroom.<br>4. Use Content Search and `New-ComplianceSearchAction -Purge` to remove items (max 10 items per run). |

```powershell
# Check Recoverable Items folder size
Get-MailboxFolderStatistics -Identity "user@contoso.com" -FolderScope RecoverableItems |
    FL Name, FolderAndSubfolderSize, ItemsInFolderAndSubfolders

# Check Recoverable Items quota on the mailbox
Get-Mailbox -Identity "user@contoso.com" | FL RecoverableItemsQuota, RecoverableItemsWarningQuota

# Check archive Recoverable Items folder size
Get-MailboxFolderStatistics -Identity "user@contoso.com" -FolderScope RecoverableItems -Archive |
    FL Name, FolderAndSubfolderSize, ItemsInFolderAndSubfolders

# Clean up Recoverable Items for mailboxes ON hold (requires eDiscovery permissions)
# Step 1: Create a targeted content search
New-ComplianceSearch -Name "CleanupRI" -ExchangeLocation "user@contoso.com" -ContentMatchQuery "folderid:<SubstrateHolds folder ID>"

# Step 2: Start the search
Start-ComplianceSearch -Identity "CleanupRI"

# Step 3: Purge items (max 10 per run)
New-ComplianceSearchAction -SearchName "CleanupRI" -Purge -PurgeType HardDelete

# Step 4: Remove purge action before re-running
Remove-ComplianceSearchAction -Identity "CleanupRI_Purge"
# Repeat steps 3-4 as needed
```

**Key Quotas Reference:**

| Scenario | Warning Quota | Hard Limit |
|---|---|---|
| Standard mailbox (no hold) | 20 GB | 30 GB |
| Mailbox on hold (no archive) | 90 GB | 100 GB |
| Mailbox on hold (archive enabled) | 95 GB | 105 GB |

---

### 19c. Litigation Hold Conflicts with Retention Policy Deletion

| Field | Detail |
|---|---|
| **Problem** | A retention policy is configured to delete items after a specific period, but items remain in the mailbox and are not permanently deleted. |
| **Root Cause** | **Litigation Hold** overrides the delete action of retention policies. When Litigation Hold is enabled, items are preserved indefinitely in the Recoverable Items folder (specifically in `DiscoveryHolds` or `Purges` subfolders) regardless of any retention policy delete settings. This follows the *first principle of retention*: retention always wins over deletion. |
| **Resolution** | 1. If Litigation Hold is no longer needed, remove it.<br>2. If Litigation Hold must remain, understand that items will be preserved until the hold is removed.<br>3. Consider using **time-based Litigation Hold** (with duration) if indefinite hold is not required.<br>4. After removing Litigation Hold, a **delay hold** is applied for 30 days before items begin to be purged. |

```powershell
# Check Litigation Hold status
Get-Mailbox -Identity "user@contoso.com" | FL LitigationHoldEnabled, LitigationHoldDate, LitigationHoldOwner, LitigationHoldDuration

# Remove Litigation Hold
Set-Mailbox -Identity "user@contoso.com" -LitigationHoldEnabled $false

# Set time-based Litigation Hold (e.g., 365 days)
Set-Mailbox -Identity "user@contoso.com" -LitigationHoldEnabled $true -LitigationHoldDuration 365

# After removing hold, check for delay hold (blocks purge for 30 days)
Get-Mailbox -Identity "user@contoso.com" | FL DelayHoldApplied
```

---

## 20. SharePoint/OneDrive — Site Deletion Blocked by Retention / Files Not Deleted

### 20a. Site Deletion Blocked by Retention Policy or Label

| Field | Detail |
|---|---|
| **Problem** | Admin attempts to delete a SharePoint site or OneDrive account but receives an error. The site cannot be deleted. |
| **Root Cause** | When a retention policy or retention label is applied to a SharePoint site, the site (and its Preservation Hold Library) cannot be deleted while retention is active. Users see an error message if they try to delete a library, list, or site that's subject to retention. This is by design — the Preservation Hold Library must persist to maintain compliance copies. |
| **Resolution** | 1. Remove the site from all retention policies.<br>2. Remove all retention labels from items in the site.<br>3. Wait for the retention policy release to take effect (up to 7 days for policy update, plus up to 37 days for Preservation Hold Library cleanup).<br>4. After all retention is released and content is cleaned up, the site can be deleted. |

```powershell
# Identify which retention policies include this site
Get-RetentionCompliancePolicy | ForEach-Object {
    $policy = Get-RetentionCompliancePolicy -Identity $_.Name -DistributionDetail
    if ($policy.SharePointLocation -contains "All" -or $policy.SharePointLocation -like "*contoso.sharepoint.com/sites/target*") {
        [PSCustomObject]@{
            PolicyName = $_.Name
            Enabled    = $_.Enabled
        }
    }
}

# Remove site from a specific retention policy
Set-RetentionCompliancePolicy -Identity "<policy name>" -RemoveSharePointLocation "https://contoso.sharepoint.com/sites/target"

# Check for retention labels on the site (PnP PowerShell)
Connect-PnPOnline -Url "https://contoso.sharepoint.com/sites/target" -Interactive
Get-PnPListItem -List "Documents" | Where-Object {$_["_ComplianceTag"] -ne $null} | Select FileLeafRef, _ComplianceTag
```

---

### 20b. Files Not Deleted After Retention Period Expires

| Field | Detail |
|---|---|
| **Problem** | Files remain in a SharePoint or OneDrive site after the retention period has expired. Content is not being moved to the Recycle Bin or permanently deleted. |
| **Root Cause** | Multiple factors contribute: (1) The **timer job** that processes the Preservation Hold Library runs **every 7 days**, and content must be in the library for at least **30 days** before cleanup. Total delay can be up to **37 days** after retention expiry. (2) Multiple retention policies/labels may apply — the *longest retention period wins*. (3) An **eDiscovery hold** blocks permanent deletion. (4) Content in the **second-stage Recycle Bin** takes an additional **93 days** before permanent deletion. (5) The site's `LockState` is set to `NoAccess` or `ReadOnly`, preventing deletion operations. |
| **Resolution** | 1. Verify all retention policies and labels applied to the site.<br>2. Wait up to 37 days after the retention period expires for the timer job to process.<br>3. Check for eDiscovery holds.<br>4. Ensure the site is not locked. |

```powershell
# Check site lock state
Get-SPOSite -Identity "https://contoso.sharepoint.com/sites/target" | Select LockState

# Check Preservation Hold Library item count and size
Connect-PnPOnline -Url "https://contoso.sharepoint.com/sites/target" -Interactive
Get-PnPList -Identity "Preservation Hold Library" | Select Title, ItemCount

# Check second-stage Recycle Bin
Get-PnPRecycleBinItem -SecondStage | Measure-Object

# Check if site is subject to eDiscovery hold
# Use the Microsoft Purview portal → eDiscovery → Cases → check holds
```

**Timeline Summary for SharePoint/OneDrive Deletion:**

| Phase | Duration |
|---|---|
| Retention period expires | As configured |
| Timer job moves to Preservation Hold Library → second-stage Recycle Bin | Up to 37 days (30 min + 7-day cycle) |
| Second-stage Recycle Bin permanent deletion | Up to 93 days |
| **Total maximum delay after retention expires** | **~130 days** |

---

### 20c. Preservation Hold Library Growing and Consuming Site Quota

| Field | Detail |
|---|---|
| **Problem** | The Preservation Hold Library on a SharePoint site grows excessively, consuming the site's storage quota. Admins or users notice the site is running out of space. |
| **Root Cause** | Every time a user edits or deletes a document subject to a retention policy, a copy is created in the Preservation Hold Library. For retention policies, **every edit** creates a new copy. With versioning enabled and frequent edits (e.g., co-authoring scenarios), the library grows rapidly. Since July 2022, all versions are retained in a **single file** in the Preservation Hold Library (improved from separate copies per version), but heavy edit activity still causes growth. The Preservation Hold Library is a **hidden system library** — it is not designed for interactive use, and manually editing/deleting its contents is **not supported**. |
| **Resolution** | 1. Increase site storage quota.<br>2. Do NOT manually delete items from the Preservation Hold Library.<br>3. Review retention policies to ensure the retention period is appropriate.<br>4. Consider using **Priority Cleanup** for exceptional scenarios.<br>5. Wait for the 7-day timer job and 30-day minimum to process expired items. |

---

## 21. Teams Retention — Shared Channels, Private Channels, and Chat-Specific Issues

### 21a. Shared Channel Messages — Retention Policy Not Applying

| Field | Detail |
|---|---|
| **Problem** | Shared channel messages do not appear to be subject to any retention policy. Messages are not being retained or deleted as expected. |
| **Root Cause** | Shared channels **inherit retention settings from the parent team**. Messages are stored in `SubstrateGroup` mailboxes (not standard `GroupMailbox`). If the parent team is not included in a `Teams channel messages` retention policy, shared channel messages will not be covered. Additionally, shared channels cannot be targeted independently — they always follow the parent team. |
| **Resolution** | 1. Ensure the **parent team** is included in a `Teams channel messages` retention policy.<br>2. For org-wide policies ("All" teams selected), shared channels are automatically included.<br>3. If using specific inclusions, add the parent team — not the shared channel itself. |

---

### 21b. Teams Retention Policy Not Applying to Specific Chat Types

| Field | Detail |
|---|---|
| **Problem** | Certain Teams chat types (1:1 chats, group chats, meeting chats, "chat with yourself") are not being covered by the retention policy. |
| **Root Cause** | The `Teams chats` location covers: private 1:1 chats, group chats, meeting chats, and "chat with yourself" messages. However, the following are **not** included: (1) **Emails and files** shared in Teams require separate `Exchange` or `SharePoint/OneDrive` retention policies. (2) **Teams meeting recordings and transcripts** from channel meetings are stored in the team's SharePoint site; from user chats, they're stored in the **organizer's OneDrive**. (3) **Guest account shadow mailboxes** are not supported by retention policies even though they may show as included. (4) Call data records for channel messages require the `Teams chats` location, not the `Teams channel messages` location. |
| **Resolution** | 1. Create a **separate retention policy** for `Microsoft 365 Group mailboxes & sites` to cover Teams files and channel meeting recordings.<br>2. Create a `SharePoint classic and communication sites` or `OneDrive accounts` policy for files shared in chat and user-chat meeting recordings.<br>3. Do not rely on Teams retention policies for file retention. |

```powershell
# Verify which Teams locations a policy covers
Get-RetentionCompliancePolicy -Identity "<policy name>" | FL TeamsChatLocation, TeamsChannelLocation

# Check if M365 Groups policy exists for Teams files
Get-RetentionCompliancePolicy | Where-Object {$_.SharePointLocation -ne $null -or $_.ModernGroupLocation -ne $null} |
    FL Name, ModernGroupLocation, SharePointLocation
```

---

### 21c. Teams Messages Visible After Retention Period — 21-Day Delay for User-Deleted Messages

| Field | Detail |
|---|---|
| **Problem** | A user deletes a Teams message, but the message doesn't actually go to the `SubstrateHolds` folder for 21 days. Admin expects the message to be immediately retained. |
| **Root Cause** | When a user deletes a Teams message, the message **disappears from the Teams app** but does NOT go into the `SubstrateHolds` folder for **21 days**. This is by design — the 21-day delay allows for potential message recovery via the Teams client. After 21 days, the message moves to `SubstrateHolds` where it is stored for at least 1 day, then permanently deleted by the next timer job (1–7 days). This means the total time from user-deletion to permanent deletion can be up to **29 days** (21 + 1 + 7). |
| **Resolution** | This is expected behavior. Communicate to stakeholders that: (1) user-deleted Teams messages have a 21-day delay before entering `SubstrateHolds`; (2) eDiscovery can still find the messages during this window; (3) the Teams app is NOT an accurate reflection of retention compliance state. |

---

### 21d. Known Configuration Issue — "When Last Modified" Setting Ignored for Teams

| Field | Detail |
|---|---|
| **Problem** | Admin configures a Teams retention policy with "Start the retention period based on: When items were last modified" but the policy uses "When items were created" instead. |
| **Root Cause** | This is a **known configuration issue** documented by Microsoft. Although the portal allows selecting "When items were last modified," the value of **"When items were created"** is always used for Teams messages. For edited messages, a copy of the original is saved with the original timestamp, and the post-edited message gets a newer timestamp. |
| **Resolution** | This is by design. Inform stakeholders that Teams retention always operates on **creation date**, regardless of the UI selection. Plan retention periods accordingly. |

---

## 22. Import Service / PST Import — Common Failures and Issues

### 22a. PST Import Job Fails — Mapping File Validation Errors

| Field | Detail |
|---|---|
| **Problem** | PST import job creation fails during mapping file validation. The CSV file does not pass validation in the Purview portal. |
| **Root Cause** | Common mapping file issues: (1) **Case sensitivity** — the `FilePath` and `Name` values must match the **exact case** used when uploading to Azure Storage. E.g., uploading as `PSTFiles` but specifying `pstfiles` in the CSV causes failure. (2) **Header row modified** — the CSV header row (Workload, FilePath, Name, Mailbox, etc.) must not be altered, including the SharePoint parameters. (3) **More than 500 rows** — the CSV mapping file supports a maximum of 500 rows. For more PST files, create multiple mapping files and multiple import jobs. (4) **Invalid Mailbox value** — the email address doesn't exist, or there are duplicate mailboxes with the same SMTP (active + soft-deleted). (5) **IsArchive set to TRUE but archive not enabled** — the import for that user fails (but doesn't block other users). |
| **Resolution** | 1. Ensure `FilePath` and `Name` match exact case used during upload.<br>2. Do not modify the header row.<br>3. Split into multiple jobs if >500 PST files.<br>4. For duplicate SMTP addresses, use the mailbox GUID instead of email.<br>5. Enable archive mailbox before importing with `IsArchive=TRUE`. |

```powershell
# Verify mailbox exists and get GUID for duplicate scenarios
Get-Mailbox -Identity "user@contoso.com" | FL ExchangeGuid, PrimarySmtpAddress

# Check for soft-deleted mailboxes with same SMTP
Get-Mailbox -SoftDeletedMailbox | Where-Object {$_.PrimarySmtpAddress -eq "user@contoso.com"} | FL ExchangeGuid

# Enable archive mailbox before import (if IsArchive=TRUE)
Enable-Mailbox -Identity "user@contoso.com" -Archive

# Verify archive is enabled
Get-Mailbox -Identity "user@contoso.com" | FL ArchiveStatus
```

**Correct CSV Mapping File Format:**
```csv
Workload,FilePath,Name,Mailbox,IsArchive,TargetRootFolder,ContentCodePage,SPFileContainer,SPManifestContainer,SPSiteUrl
Exchange,,annb.pst,annb@contoso.onmicrosoft.com,FALSE,/,,,,
Exchange,,annb_archive.pst,annb@contoso.onmicrosoft.com,TRUE,,,,,
Exchange,PSTFiles,pilarp.pst,pilarp@contoso.onmicrosoft.com,FALSE,/,,,,
```

---

### 22b. PST Upload Fails — AzCopy Errors or SAS URL Issues

| Field | Detail |
|---|---|
| **Problem** | AzCopy upload of PST files to Azure Storage fails. Common errors include authentication failures, timeout errors, or "access denied" messages. |
| **Root Cause** | (1) **Wrong AzCopy version** — only the version downloaded from the Purview portal Import page is supported. Using a different version (e.g., from GitHub or Azure docs) is not supported. (2) **SAS URL expired** — the SAS URL is valid for a limited time. If too much time passes between obtaining the URL and uploading, it expires. (3) **SAS URL not properly quoted** — in scripts or batch files, special characters (`%`, `&`) must be escaped (`%%`, `^&`). (4) **PST file >20 GB** — individual PST files larger than 20 GB can impact performance. Not a hard limit but strongly discouraged. (5) **Network issues** — corporate firewalls or proxies blocking outbound connections to Azure blob storage. (6) **Source path issues** — the source path must point to a directory, not an individual PST file. |
| **Resolution** | 1. Always download AzCopy from the Purview portal Import page (or from `https://aka.ms/downloadazcopylatest`).<br>2. Generate a new SAS URL if the current one may have expired.<br>3. Properly escape special characters in scripts.<br>4. Keep PST files under 20 GB each.<br>5. Ensure outbound access to `*.blob.core.windows.net` on ports 443 and 10000-10100. |

```powershell
# Example AzCopy upload command (from file share)
azcopy.exe copy "\\FILESERVER1\PSTs" "<SAS URL>"

# Example with subfolder in Azure destination
azcopy.exe copy "\\FILESERVER1\PSTs" "<SAS URL with /PSTFiles/ appended before ?"

# From an Azure Storage source with access tier preservation disabled
azcopy.exe copy "<source Azure SAS URL>" "<destination SAS URL>" --s2s-preserve-access-tier=false --recursive

# Verify upload by checking file list in Azure Storage Explorer
# Or re-run the AzCopy command — it skips already-uploaded files
```

---

### 22c. PST Import Job Stuck in "Analysis in progress" or Fails to Complete

| Field | Detail |
|---|---|
| **Problem** | After creating the import job, it remains in "Analysis in progress" for an extended period, or the status never changes to "Analysis completed." |
| **Root Cause** | (1) PST files are **corrupt** or in **ANSI format** and the analysis engine encounters issues. (2) PST files were **not fully uploaded** to Azure — partial files cause analysis failures. (3) **Service-side delays** — large batches of PST files or high service load can slow analysis. (4) PST files uploaded to wrong container or subfolder — the import job can't find the files. |
| **Resolution** | 1. Verify PST files uploaded successfully using Azure Storage Explorer.<br>2. Use **Unicode PST format** (Outlook 2007+) — ANSI format is supported but may cause issues with DBCS languages.<br>3. Check that PST file names in Azure match the `Name` column in the CSV (case-sensitive).<br>4. For large imports (>500 files), split into multiple jobs.<br>5. If stuck for >48 hours, contact Microsoft Support. |

---

### 22d. Imported Items Immediately Deleted by Retention Policy

| Field | Detail |
|---|---|
| **Problem** | After PST import completes, older messages are immediately deleted or moved to archive by the existing retention policy on the target mailbox. |
| **Root Cause** | After PST import, the Import Service automatically sets `RetentionHoldEnabled = $true` on the mailbox (indefinite duration). However, if an admin **manually disables** the retention hold prematurely, or if the retention hold was already disabled, the MRM retention policy processes the mailbox and may delete or archive old items whose retention period has already expired based on their original dates. |
| **Resolution** | 1. Keep `RetentionHoldEnabled = $true` until you've reviewed imported content.<br>2. Set an end date for the retention hold rather than leaving it indefinite.<br>3. Adjust the MRM retention policy to accommodate older imported items before turning off the hold. |

```powershell
# Check retention hold status after import
Get-Mailbox -Identity "user@contoso.com" | FL RetentionHoldEnabled, StartDateForRetentionHold, EndDateForRetentionHold

# Set retention hold to expire after 30 days (giving time to review)
Set-Mailbox -Identity "user@contoso.com" -EndDateForRetentionHold (Get-Date).AddDays(30)

# Manually turn off retention hold (when ready)
Set-Mailbox -Identity "user@contoso.com" -RetentionHoldEnabled $false
```

---

### 22e. PST Import — Items Larger Than 150 MB Are Skipped

| Field | Detail |
|---|---|
| **Problem** | Some items from the PST file are not imported. The import job shows "Complete" but not all items appear in the target mailbox. |
| **Root Cause** | Items larger than **150 MB** are automatically **skipped** during import. This is the Exchange Online message size limit. The import process silently skips these items without generating a per-item error. Additionally, the `MaxReceiveSize` property on the target mailbox is automatically increased to 150 MB if a PST contains items between 35 MB and 150 MB. |
| **Resolution** | 1. Before import, check for items >150 MB in the PST file.<br>2. Items >150 MB cannot be imported via PST Import — they must be uploaded via alternative methods (e.g., drag-and-drop if small enough, or OneDrive). |

```powershell
# Check the current MaxReceiveSize on target mailbox
Get-Mailbox -Identity "user@contoso.com" | FL MaxReceiveSize

# The import service will auto-increase MaxReceiveSize to 150 MB if needed
```

---

### 22f. PST Import — Permissions and Role Requirements

| Field | Detail |
|---|---|
| **Problem** | Admin cannot create PST import jobs. The Import page is not visible or the "New import job" option is unavailable. |
| **Root Cause** | Two separate permissions are required: (1) **Mailbox Import Export** role in Exchange Online (not assigned to any role group by default). (2) **Mail Recipients** role in Exchange Online (assigned to Organization Management and Recipient Management by default). Both roles must be assigned to the admin. Alternatively, the admin must be a **Global Administrator**. |
| **Resolution** | 1. Create a dedicated role group for PST import.<br>2. Assign both `Mailbox Import Export` and `Mail Recipients` roles. |

```powershell
# Create a new role group for PST import
New-RoleGroup -Name "PST Import Admins" -Roles "Mailbox Import Export", "Mail Recipients" -Members "admin@contoso.com"

# Or add the role to Organization Management
New-ManagementRoleAssignment -Role "Mailbox Import Export" -SecurityGroup "Organization Management"

# Verify role assignment
Get-ManagementRoleAssignment -Role "Mailbox Import Export" | FL RoleAssigneeName
```

---

### 22g. PST Files Auto-Deleted from Azure Storage After 30 Days

| Field | Detail |
|---|---|
| **Problem** | PST files uploaded to Azure are no longer available when the admin tries to create an import job. The file list appears empty for older import jobs. |
| **Root Cause** | All PST files in the `ingestiondata` Azure blob container are automatically **deleted 30 days** after the most recent import job was created. If no new import job is created within 30 days of uploading, the files are purged. |
| **Resolution** | 1. Create the import job **within 30 days** of uploading PST files.<br>2. If files were deleted, re-upload them using AzCopy with a fresh SAS URL.<br>3. Always keep a local copy of PST files until the import job completes successfully. |

---

## References

- [Learn about retention policies and labels](https://learn.microsoft.com/en-us/purview/retention)
- [Retention for SharePoint and OneDrive](https://learn.microsoft.com/en-us/purview/retention-policies-sharepoint)
- [Retention for Exchange](https://learn.microsoft.com/en-us/purview/retention-policies-exchange)
- [Retention for Teams](https://learn.microsoft.com/en-us/purview/retention-policies-teams)
- [Auto-apply retention labels](https://learn.microsoft.com/en-us/purview/apply-retention-labels-automatically)
- [Adaptive scopes](https://learn.microsoft.com/en-us/purview/purview-adaptive-scopes)
- [Disposition of content](https://learn.microsoft.com/en-us/purview/disposition)
- [Retention limits](https://learn.microsoft.com/en-us/purview/retention-limits)
- [Identify errors in retention policies](https://learn.microsoft.com/en-us/microsoft-365/troubleshoot/retention/identify-errors-in-retention-and-retention-label-policies)
- [Resolve errors in retention policies](https://learn.microsoft.com/en-us/microsoft-365/troubleshoot/retention/resolve-errors-in-retention-and-retention-label-policies)
- [PowerShell cmdlets for retention](https://learn.microsoft.com/en-us/purview/retention-cmdlets)
- [Enable archive mailboxes](https://learn.microsoft.com/en-us/purview/enable-archive-mailboxes)
- [Learn about archive mailboxes](https://learn.microsoft.com/en-us/purview/archive-mailboxes)
- [Learn about auto-expanding archiving](https://learn.microsoft.com/en-us/purview/autoexpanding-archiving)
- [Learn about inactive mailboxes](https://learn.microsoft.com/en-us/purview/inactive-mailboxes-in-office-365)
- [Create and manage inactive mailboxes](https://learn.microsoft.com/en-us/purview/create-and-manage-inactive-mailboxes)
- [Recover an inactive mailbox](https://learn.microsoft.com/en-us/purview/recover-an-inactive-mailbox)
- [Delete an inactive mailbox](https://learn.microsoft.com/en-us/purview/delete-an-inactive-mailbox)
- [Retention tags and retention policies](https://learn.microsoft.com/en-us/exchange/security-and-compliance/messaging-records-management/retention-tags-and-policies)
- [Default Retention Policy](https://learn.microsoft.com/en-us/exchange/security-and-compliance/messaging-records-management/default-retention-policy)
- [How to identify holds on a mailbox](https://learn.microsoft.com/en-us/purview/ediscovery-identify-a-hold-on-an-exchange-online-mailbox)
- [Recoverable Items folder issues](https://learn.microsoft.com/en-us/troubleshoot/exchange/antispam-and-protection/recoverable-items-folder-full)
- [Recoverable Items folder in Exchange Online](https://learn.microsoft.com/en-us/exchange/security-and-compliance/recoverable-items-folder/recoverable-items-folder)
- [Clean up Recoverable Items folder](https://learn.microsoft.com/en-us/exchange/security-and-compliance/recoverable-items-folder/clean-up-deleted-items)
- [Learn about importing PST files](https://learn.microsoft.com/en-us/purview/importing-pst-files-to-office-365)
- [Use network upload to import PST files](https://learn.microsoft.com/en-us/purview/use-network-upload-to-import-pst-files)
- [Preservation Lock for retention policies](https://learn.microsoft.com/en-us/purview/retention-preservation-lock)
- [Create and configure retention policies](https://learn.microsoft.com/en-us/purview/create-retention-policies)
- [Principles of retention (what takes precedence)](https://learn.microsoft.com/en-us/purview/retention#the-principles-of-retention-or-what-takes-precedence)
