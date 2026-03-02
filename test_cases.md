# SplitEx: Comprehensive Manual Test Cases

This document outlines the end-to-end test cases for validating the full functionality of the SplitEx application. Focus heavily on state consistency, especially in the newly refactored Expense and Settlement flows.

## 1. Authentication & Onboarding
| ID | Title | Steps | Expected Result | Status |
|---|---|---|---|---|
| AUTH-01 | Sign Up | 1. Enter valid email and password <br> 2. Click Sign Up | Verification email sent, user account created in `auth.users`. | [ ] |
| AUTH-02 | Sign In | 1. Enter registered email and password <br> 2. Click Sign In | User successfully authenticates and redirects to Dashboard. | [ ] |
| AUTH-03 | Sign Out | 1. Navigate to Account/Profile <br> 2. Click Sign out | User session cleared, redirected to login page. | [ ] |
| AUTH-04 | Password Reset | 1. Click "Forgot Password" <br> 2. Enter email and submit <br> 3. Click link in email | Password reset successful, user can log in with new password. | [ ] |

## 2. Profile Management
| ID | Title | Steps | Expected Result | Status |
|---|---|---|---|---|
| PROF-01 | Setup Profile | 1. After sign up, enter user Name <br> 2. Click Save | Profile data saved across sessions, visible in `profiles` table. | [ ] |
| PROF-02 | Edit Profile | 1. Go to Account <br> 2. Edit user Name <br> 3. Save | Updates reflect instantly across the application UI. | [ ] |

## 3. Group Management
| ID | Title | Steps | Expected Result | Status |
|---|---|---|---|---|
| GRP-01 | Create Group | 1. Click + from Groups tab <br> 2. Select "Create New Group" <br> 3. Enter name, select currency | Group created, user set as admin/member, group appears on Dash. | [ ] |
| GRP-02 | Generate Invite Code | 1. Open Group > Settings <br> 2. Copy Invite Link/Code | Code is copied to clipboard successfully. | [ ] |
| GRP-03 | Join via Code | 1. Click + from Groups tab (User 2) <br> 2. "Join via Code" <br> 3. Submit valid code | User 2 successfully added to group members, sees group on dash. | [ ] |
| GRP-04 | Delete Group | 1. As Creator, go to Group Settings <br> 2. Click "Delete Group" | Group, associated expenses, and members cascade deleted. | [ ] |
| GRP-05 | Leave Group | 1. As Non-Creator, go to Group Settings <br> 2. Click "Leave Group" | User removed from members array. (Fail if unsettled debts exist). | [ ] |

## 4. Expense Management (Atomic RPC Refactor)
| ID | Title | Steps | Expected Result | Status |
|---|---|---|---|---|
| EXP-01 | Add Equal Expense | 1. Add Expense -> Enter Amount (e.g., 100) <br> 2. Description <br> 3. Select "EQUAL" <br> 4. Save | Exactly ONE network RPC call made. 100 split instantly among N members. No orphaned records. | [ ] |
| EXP-02 | Add Unequal Expense | 1. Add Expense -> Amount (e.g., 100) <br> 2. Select "UNEQUAL" <br> 3. Manually distribute values <br> 4. Save | Expense saves accurately mapping to the custom inputs. Error explicitly blocks if sum !== total. | [ ] |
| EXP-03 | Edit Expense | 1. Click an Expense <br> 2. Modify Amount / Splits (Change Equal to Unequal) <br> 3. Save | Exactly ONE network RPC call updates the expense AND correctly swaps out the `expense_splits` rows. | [ ] |
| EXP-04 | Delete Expense | 1. Click an Expense <br> 2. Click Delete | Expense row disappears. `expense_splits` safely removed via DB constraints. | [ ] |
| EXP-05 | Atomic Network Loss Simulation | 1. Throttling Network to Offline in DevTools during RPC execution <br> 2. Hit Save | The entire operation aborts. You do NOT get an `expenses` row without its matching `expense_splits` rows. | [ ] |

## 5. Settlement Flow (Atomic RPC Refactor)
| ID | Title | Steps | Expected Result | Status |
|---|---|---|---|---|
| SET-01 | Settle Full Amount | 1. Click "Settle Up" <br> 2. Select target receiver <br> 3. Settle total owed amount | Settlement expense created. Status is `pending_confirmation`. Debt goes to 0 instantly. | [ ] |
| SET-02 | Settle Partial Amount | 1. Click "Settle Up" <br> 2. Settle 50% of owed amount | Settlement created. Debt reduced by 50%. | [ ] |
| SET-03 | Receiver Confirm | 1. As Receiver, open Settlement Details <br> 2. Click "Confirm Received" | Status changes to `confirmed`. Timestamp is accurately logged. | [ ] |
| SET-04 | Payer Cancel | 1. As Payer, open Pending Settlement <br> 2. Click "Cancel" <br> 3. Give reason | Status changes to `cancelled`. Debt is returned to pre-settlement states. | [ ] |
| SET-05 | Edit Pending Settlement | 1. As Payer, edit an unconfirmed settlement amount. <br> 2. Save | Details reflect new values. Balances immediately readjust. | [ ] |

## 6. Logic & Dashboard Consistency
| ID | Title | Steps | Expected Result | Status |
|---|---|---|---|---|
| BAL-01 | Overall "You Owe/Owed" Dashboard | 1. Add expenses across two groups. | Home screen balances sum across all groups correctly. | [ ] |
| BAL-02 | Currency Format | 1. Change user preferred currency to GBP. | Balances display as £10.00 consistently application-wide. | [ ] |

## 7. Notifications
| ID | Title | Steps | Expected Result | Status |
|---|---|---|---|---|
| NOT-01 | Expense Added | 1. User A adds, User B checks top-right bell. | User B sees unread notification for "New Expense". | [ ] |
| NOT-02 | Settlement Actioned | 1. User A triggers Settlement, User B confirms. | Both parties receive push/app notifications documenting the state change. | [ ] |

*Remember: Check devtools network tab during these scenarios to monitor query quantity (ensure N+1 fetching isn't happening) and RPC behavior.*
