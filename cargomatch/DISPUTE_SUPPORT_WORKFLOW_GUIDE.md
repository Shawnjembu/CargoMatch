# CargoMatch Dispute & Support System - Complete Workflow Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Database Schema](#database-schema)
4. [Dispute System](#dispute-system)
5. [Support Chat System](#support-chat-system)
6. [Admin Management](#admin-management)
7. [Real-time Notifications](#real-time-notifications)
8. [User Interfaces](#user-interfaces)
9. [API & Functions](#api--functions)
10. [Complete Workflows](#complete-workflows)

---

## Overview

CargoMatch includes two integrated communication systems for issue resolution:

1. **Dispute System** - For shipment-related conflicts between shippers and carriers
2. **Support Chat** - For direct communication with CargoMatch admin team

Both systems provide real-time updates, email notifications, and full audit trails.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DISPUTE & SUPPORT SYSTEM                     │
└─────────────────────────────────────────────────────────────────┘

├── DISPUTE SYSTEM (Shipment Issues)
│   ├── DisputeModal Component
│   │   └── User raises dispute on delivered shipment
│   ├── Disputes Database Table
│   │   └── Stores all dispute records
│   ├── AdminDashboard - Disputes Tab
│   │   └── Review, update status, add resolution notes
│   └── Email & In-App Notifications
│       └── Alerts parties when status changes
│
└── SUPPORT SYSTEM (General Help)
    ├── Support Chat UI (Messages page)
    │   └── Direct messaging with admin team
    ├── Support Tables (threads + messages)
    │   └── Persistent chat history
    ├── AdminDashboard - Support Tab
    │   └── View all threads, reply to users
    └── Real-time Updates
        └── Instant message delivery

```

---

## Database Schema

### Disputes Table

**File:** [`DISPUTES_MIGRATION.sql`](DISPUTES_MIGRATION.sql)

```sql
CREATE TABLE public.disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id     UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  raised_by       UUID NOT NULL REFERENCES public.profiles(id),
  reason          TEXT NOT NULL,
  details         TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','under_review','resolved','dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);
```

**Key Fields:**
- `shipment_id` - Links dispute to specific shipment
- `raised_by` - User who filed the dispute
- `reason` - One of 9 predefined reasons
- `details` - Optional additional context
- `status` - Current state of dispute
- `resolution_note` - Admin's final resolution message

**Indexes:**
```sql
CREATE INDEX disputes_shipment_id_idx ON disputes(shipment_id);
CREATE INDEX disputes_raised_by_idx ON disputes(raised_by);
CREATE INDEX disputes_status_idx ON disputes(status);
```

### Support Tables

**File:** [`MESSAGES_SUPPORT_FIX.sql`](MESSAGES_SUPPORT_FIX.sql)

```sql
-- Thread represents one user's support conversation
CREATE TABLE public.support_threads (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages within a support thread
CREATE TABLE public.support_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id  UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.profiles(id),
  body       TEXT NOT NULL,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Features:**
- One thread per user (auto-created on first message)
- sender_id can be user or admin
- `read` flag for unread message tracking
- `updated_at` updates on new messages

---

## Dispute System

### Status Lifecycle

```
┌─────────┐
│  open   │ ← Dispute created by user
└────┬────┘
     │
     v
┌──────────────┐
│ under_review │ ← Admin reviewing case
└──────┬───────┘
       │
       ├──────────────┬──────────────┐
       v              v              v
┌──────────┐   ┌───────────┐   ┌──────────┐
│ resolved │   │ dismissed │   │   open   │
└──────────┘   └───────────┘   └──────────┘
   (Final)         (Final)      (Back to open)
```

**Status Definitions:**
- **open** - Newly filed, awaiting admin review
- **under_review** - Admin is investigating the issue
- **resolved** - Issue resolved in favor of disputing party
- **dismissed** - Dispute found to be invalid/unfounded

### User Entry Points

#### Shipper Dashboard
**Location:** [`ShipperDashboard.jsx`](src/pages/ShipperDashboard.jsx)

```jsx
// Trip details modal - "Raise Dispute" button
<button onClick={() => setDisputeModal(trip)}>
  <AlertTriangle size={13} /> Raise Dispute
</button>
```

**Requirements:**
- Shipment must be in "delivered" status
- User must be the shipper
- One dispute per shipment per user

#### Carrier Dashboard
**Location:** [`CarrierDashboard.jsx`](src/pages/CarrierDashboard.jsx)

```jsx
// Trip details modal - "Raise Dispute" button
<button onClick={() => setDisputeModal(trip)}>
  <AlertTriangle size={13} /> Raise Dispute
</button>
```

**Requirements:**
- Shipment must be in "delivered" status
- User must be the carrier
- One dispute per shipment per user

### DisputeModal Component

**File:** [`DisputeModal.jsx`](src/components/DisputeModal.jsx)

**Props:**
```typescript
{
  shipmentId: UUID      // Shipment being disputed
  shipmentRef: string   // Human-readable reference (e.g., "CM-1234")
  otherPartyId: UUID    // Other party's user ID (for notifications)
  onClose: () => void
  onDisputeRaised: (dispute) => void
}
```

**Predefined Reasons:**
1. Cargo damaged in transit
2. Cargo not delivered
3. Wrong delivery location
4. Delivery significantly delayed
5. Carrier did not show up
6. Shipper provided incorrect cargo details
7. Payment issue
8. Unprofessional conduct
9. Other

**Form Fields:**
- **Reason*** (required) - Dropdown selection
- **Additional details** (optional) - Textarea for context

**Submission Flow:**
```javascript
1. Validate reason is selected
2. Insert dispute record into database
3. Send in-app notification to other party
4. Send email notification to other party
5. Call onDisputeRaised callback
6. Close modal
```

### Row-Level Security (RLS)

**Admin Access:**
```sql
CREATE POLICY "Admins full access to disputes"
  ON public.disputes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ));
```

**User Access:**
```sql
CREATE POLICY "Parties can view disputes on their shipments"
  ON public.disputes FOR SELECT
  USING (
    raised_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = disputes.shipment_id
      AND (s.shipper_id = auth.uid() OR ...)
    )
  );
```

**Create Restriction:**
```sql
CREATE POLICY "Parties can raise disputes on delivered shipments"
  ON public.disputes FOR INSERT
  WITH CHECK (
    raised_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.shipments s
      WHERE s.id = shipment_id
      AND s.status = 'delivered'
      AND (user is party to shipment)
    )
  );
```

---

## Support Chat System

### Support Thread Creation

**Auto-created on first user message:**
```javascript
// In Messages.jsx - fetchSupportThread()
let { data: thread } = await supabase
  .from('support_threads')
  .select('id')
  .eq('user_id', user.id)
  .maybeSingle()

if (!thread) {
  const { data: newThread } = await supabase
    .from('support_threads')
    .insert({ user_id: user.id })
    .select('id')
    .single()
  thread = newThread
}
```

### User Interface

**Location:** [`Messages.jsx`](src/pages/Messages.jsx)

**Features:**
- Pinned at top of conversations list
- Icon: Headphones
- Label: "CargoMatch Support"
- Always visible (except for admin users)

**UI Elements:**
```jsx
<ConvoItem 
  c={supportConvo} 
  active={activeId === SUPPORT_ID} 
/>
```

**Message Input:**
- Standard text input
- Send button
- No quick replies (unlike shipment chats)

### Admin Interface

**Location:** [`AdminDashboard.jsx`](src/pages/AdminDashboard.jsx) - Support Tab

**Features:**
- List all support threads
- Show unread count per thread
- Select thread to view conversation
- Reply directly to users
- Real-time message updates

**Thread List:**
```jsx
{supportThreads.map(t => (
  <button onClick={() => setActiveSupportId(t.id)}>
    <Headphones />
    {t.userName}
    {t.unread > 0 && <span>{t.unread}</span>}
  </button>
))}
```

**Conversation View:**
```jsx
<div className="messages-container">
  {thread.messages.map(msg => (
    <div className={msg.sender_id === user.id ? 'admin-message' : 'user-message'}>
      {msg.body}
      <span>{msg.created_at}</span>
    </div>
  ))}
</div>

<div className="reply-input">
  <input value={supportInput} onChange={...} />
  <button onClick={() => sendSupportReply()}>
    <Send /> Send
  </button>
</div>
```

### Real-time Updates

**User Side:**
```javascript
// Messages.jsx
supabase.channel('messages-realtime')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'support_messages'
  }, () => {
    fetchSupportThread()
  })
  .subscribe()
```

**Admin Side:**
```javascript
// AdminDashboard.jsx
// Real-time subscription refreshes thread list
// when new support messages arrive
```

---

## Admin Management

### Disputes Management

**Location:** [`AdminDashboard.jsx`](src/pages/AdminDashboard.jsx) - Disputes Tab

**Main View - Dispute List:**
```jsx
{disputes.map(dispute => (
  <div className="dispute-card">
    <div className="dispute-header">
      <span className="reference">{dispute.shipments.reference}</span>
      <span className={`status ${dispute.status}`}>{dispute.status}</span>
    </div>
    <div className="dispute-info">
      <p className="reason">{dispute.reason}</p>
      <p className="raised-by">{dispute.profiles.full_name}</p>
      <span className="date">{dispute.created_at}</span>
    </div>
    <button onClick={() => setSelectedDispute(dispute)}>
      View Details →
    </button>
  </div>
))}
```

**Detail Panel:**
When dispute is selected, shows:
- Full shipment details
- Dispute reason & details
- Timeline of status changes
- Both parties' information
- Resolution note input field
- Status change buttons

**Status Update Function:**
```javascript
const updateDisputeStatus = async (disputeId, newStatus, note) => {
  // 1. Update dispute record
  await supabase.from('disputes')
    .update({
      status: newStatus,
      resolution_note: note || null,
      ...(isFinal ? { resolved_at: new Date() } : {})
    })
    .eq('id', disputeId)

  // 2. Create notifications for both parties
  await supabase.from('notifications').insert([
    {
      user_id: shipperId,
      type: 'alert',
      title: 'Dispute status updated',
      body: `Dispute on ${ref} is now: ${newStatus} — ${note}`,
      link: '/shipper'
    },
    {
      user_id: carrierId,
      type: 'alert',
      title: 'Dispute status updated',
      body: `Dispute on ${ref} is now: ${newStatus} — ${note}`,
      link: '/carrier'
    }
  ])

  // 3. Send email notifications
  emailDisputeUpdated({...})
}
```

### Support Messages Management

**Location:** [`AdminDashboard.jsx`](src/pages/AdminDashboard.jsx) - Support Tab

**Thread Selection:**
```javascript
const [activeSupportId, setActiveSupportId] = useState(null)
const activeThread = supportThreads.find(t => t.id === activeSupportId)
```

**Send Reply:**
```javascript
const sendSupportReply = async (threadId, userId) => {
  // 1. Insert admin's message
  await supabase.from('support_messages').insert({
    thread_id: threadId,
    sender_id: user.id, // Admin's ID
    body: supportInput.trim()
  })

  // 2. Send notification to user
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'system',
    title: 'Support team replied',
    body: supportInput.trim().slice(0, 80),
    link: '/messages/support'
  })

  // 3. Clear input and refresh
  setSupportInput('')
  fetchSupportThreads()
}
```

---

## Real-time Notifications

### System Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Database   │◄────►│   Supabase   │◄────►│   Frontend   │
│  (Postgres)  │      │   Realtime   │      │  (WebSocket) │
└──────────────┘      └──────────────┘      └──────────────┘
      ▲                                            │
      │ INSERT/UPDATE                              │
      └────────────────────────────────────────────┘
```

### Publication Setup

**File:** [`MESSAGES_SUPPORT_FIX.sql`](MESSAGES_SUPPORT_FIX.sql)

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

### Subscription Patterns

**Messages Page (User):**
```javascript
supabase.channel('messages-realtime')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'support_messages'
  }, () => {
    fetchSupportThread() // Refresh support chat
  })
  .subscribe()
```

**Admin Dashboard:**
```javascript
// Support threads auto-refresh on new messages
// Dispute list auto-refreshes when disputes created
```

---

## User Interfaces

### Dispute Button Placement

**Shipper Dashboard:**
```
┌─────────────────────────────────────────┐
│  Shipment CM-1234                       │
│  Status: Delivered                      │
│  ┌───────────────┐  ┌────────────────┐ │
│  │ Track Shipment│  │ Raise Dispute  │ │
│  └───────────────┘  └────────────────┘ │
└─────────────────────────────────────────┘
```

**Carrier Dashboard:**
```
┌─────────────────────────────────────────┐
│  Trip CM-1234                           │
│  Status: Delivered                      │
│  ┌───────────────┐  ┌────────────────┐ │
│  │ View Details  │  │ Raise Dispute  │ │
│  └───────────────┘  └────────────────┘ │
└─────────────────────────────────────────┘
```

### Support Chat Placement

**Messages Page:**
```
┌──────────────────────────────────────────┐
│ Messages                                 │
├──────────────────────────────────────────┤
│ 🎧 CargoMatch Support          📬 2     │ ← Always at top
├──────────────────────────────────────────┤
│ John Doe - CM-1234            👤        │
│ Jane Smith - CM-5678          👤        │
└──────────────────────────────────────────┘
```

### Admin Dashboard Tabs

```
┌────────────────────────────────────────────────────┐
│ [Overview] [Users] [Carriers] [Shipments]         │
│ [Disputes] [Support] ← Issue management tabs       │
└────────────────────────────────────────────────────┘
```

---

## API & Functions

### Dispute Operations

**Create Dispute:**
```javascript
// Client-side (DisputeModal.jsx)
const { data, error } = await supabase
  .from('disputes')
  .insert({
    shipment_id: shipmentId,
    raised_by: user.id,
    reason: selectedReason,
    details: detailsText,
    status: 'open'
  })
  .select()
  .single()
```

**Update Dispute Status:**
```javascript
// Admin-side (AdminDashboard.jsx)
const { error } = await supabase
  .from('disputes')
  .update({
    status: newStatus,
    resolution_note: note,
    resolved_at: isFinal ? new Date() : null
  })
  .eq('id', disputeId)
```

**Fetch Disputes:**
```javascript
// With full relational data
const { data } = await supabase
  .from('disputes')
  .select(`
    *,
    shipments(reference, shipper_id, carrier_id,
      profiles!shipments_shipper_id_fkey(full_name),
      carriers(company_name, user_id)
    ),
    profiles!disputes_raised_by_fkey(full_name, role)
  `)
  .order('created_at', { ascending: false })
```

### Support Operations

**Create/Get Thread:**
```javascript
let { data: thread } = await supabase
  .from('support_threads')
  .select('id')
  .eq('user_id', user.id)
  .maybeSingle()

if (!thread) {
  const { data: newThread } = await supabase
    .from('support_threads')
    .insert({ user_id: user.id })
    .select('id')
    .single()
  thread = newThread
}
```

**Send Support Message:**
```javascript
const { error } = await supabase
  .from('support_messages')
  .insert({
    thread_id: threadId,
    sender_id: user.id,
    body: messageText
  })
```

**Mark Messages Read:**
```javascript
await supabase
  .from('support_messages')
  .update({ read: true })
  .eq('thread_id', threadId)
  .neq('sender_id', user.id) // Don't mark own messages as read
```

---

## Complete Workflows

### Workflow 1: User Raises Dispute

```
┌─────────────────────────────────────────────────────────┐
│               USER RAISES DISPUTE WORKFLOW              │
└─────────────────────────────────────────────────────────┘

1. 📱 User Action
   └─► User views delivered shipment
       └─► Clicks "Raise Dispute" button

2. 🎯 Modal Opens
   └─► DisputeModal component renders
       ├─► Displays shipment reference
       ├─► Shows predefined reasons dropdown
       ├─► Optional details textarea
       └─► Submit button

3. ✍️ User Fills Form
   └─► Selects reason from dropdown *
       └─► (Optional) Adds additional details

4. 📤 Submission
   └─► Client validates required fields
       └─► Insert dispute record
           ├─► shipment_id: UUID
           ├─► raised_by: user.id
           ├─► reason: selected value
           ├─► details: optional text
           └─► status: 'open'

5. 🔔 Notifications Sent
   ├─► In-app notification to other party
   │   ├─► type: 'alert'
   │   ├─► title: "Dispute raised on your shipment"
   │   └─► link: dashboard URL
   └─► Email to other party
       └─► "A dispute has been raised on CM-XXXX"

6. ✅ Confirmation
   └─► Modal closes
       └─► Dashboard updates
           └─► Dispute visible to both parties
```

### Workflow 2: Admin Reviews Dispute

```
┌─────────────────────────────────────────────────────────┐
│              ADMIN REVIEWS DISPUTE WORKFLOW             │
└─────────────────────────────────────────────────────────┘

1. 🔍 Admin Access
   └─► Log in to Admin Dashboard
       └─► Navigate to "Disputes" tab

2. 📋 View List
   └─► See all disputes sorted by date
       ├─► Status badges (open/under_review/resolved/dismissed)
       ├─► Shipment references
       ├─► Parties involved
       └─► Brief reason

3. 🎯 Select Dispute
   └─► Click on dispute card
       └─► Detail panel opens
           ├─► Full shipment details
           ├─► Complete dispute info
           ├─► Timeline
           └─► Both parties' contact info

4. 📝 Review Details
   └─► Read reason & details
       └─► Check shipment history
           └─► Contact parties if needed (via support)

5. 🔄 Update Status
   └─► Select new status:
       ├─► "Under Review" - Investigating
       ├─► "Resolved" - Issue fixed
       └─► "Dismissed" - Invalid claim
   └─► Add resolution note
       └─► Click "Update Status"

6. 🔔 Parties Notified
   ├─► In-app notifications sent to:
   │   ├─► Shipper
   │   └─► Carrier
   └─► Email notifications sent
       └─► "Dispute on CM-XXXX is now: [status]"

7. 📊 Audit Trail
   └─► All changes logged
       ├─► Status changes
       ├─► Resolution notes
       └─► Timestamps
```

### Workflow 3: User Contacts Support

```
┌─────────────────────────────────────────────────────────┐
│            USER CONTACTS SUPPORT WORKFLOW               │
└─────────────────────────────────────────────────────────┘

1. 💬 User Access
   └─► Navigate to Messages page
       └─► See "CargoMatch Support" at top

2. 🎯 Open Support Chat
   └─► Click on support conversation
       └─► Thread auto-created if first time
           └─► Empty chat appears

3. ✍️ Send Message
   └─► Type question/issue
       └─► Click send
           └─► Message inserted to support_messages

4. 🔔 Admin Notified
   └─► Real-time update in Admin Dashboard
       ├─► Support tab shows unread count
       └─► Push notification (if configured)

5. 👨‍💼 Admin Responds
   └─► Admin opens Support tab
       └─► Selects user's thread
           └─► Views conversation history
               └─► Types reply & sends

6. 📨 User Receives Reply
   └─► Real-time update in Messages page
       ├─► Message appears instantly
       └─► In-app notification
           └─► "Support team replied"

7. 🔄 Back-and-Forth
   └─► Conversation continues
       ├─► All messages persisted
       ├─► Read receipts tracked
       └─► Thread stays open until resolved

8. ✅ Resolution
   └─► Admin marks thread as "resolved"
       └─► Thread archived but visible
           └─► Can be reopened if needed
```

---

## Validation & Required Fields

### Dispute Submission

**Required:**
- ✅ `reason` - Must select from dropdown

**Optional:**
- `details` - Additional context

**Automatic:**
- `shipment_id` - From context
- `raised_by` - Current user ID
- `status` - Always 'open'
- `created_at` - Auto timestamp

**Business Rules:**
- Shipment must be "delivered" status
- User must be party to shipment
- One dispute per shipment per user

### Support Message

**Required:**
- ✅ `body` - Message text (min 1 char after trim)

**Optional:**
- None

**Automatic:**
- `thread_id` - From or created
- `sender_id` - Current user ID
- `read` - FALSE
- `created_at` - Auto timestamp

---

## Dispute History Tracking

### User View

**Location:** Shipper/Carrier Dashboard - Shipment Details

```jsx
{trip.dispute && (
  <div className="dispute-status">
    <div className="header">
      <AlertTriangle />
      <span>Dispute Status: {trip.dispute.status}</span>
    </div>
    <div className="details">
      <p><strong>Reason:</strong> {trip.dispute.reason}</p>
      {trip.dispute.details && (
        <p><strong>Details:</strong> {trip.dispute.details}</p>
      )}
      <p><strong>Filed:</strong> {formatDate(trip.dispute.created_at)}</p>
      {trip.dispute.resolution_note && (
        <div className="resolution">
          <p><strong>Resolution:</strong></p>
          <p>{trip.dispute.resolution_note}</p>
        </div>
      )}
    </div>
  </div>
)}
```

### Admin View

**Location:** Admin Dashboard - Disputes Tab - Detail Panel

Shows complete audit trail:
- Original submission (reason, details, date)
- All status changes with timestamps
- Resolution notes
- Parties involved
- Related shipment details
- Communication history

---

## Email Notifications

**File:** [`emailNotify.js`](src/lib/emailNotify.js)

### Dispute Raised

```javascript
emailDisputeRaised({
  userId: otherPartyId,
  shipmentRef: 'CM-1234',
  reason: 'Cargo damaged in transit',
  raisedBy: 'shipper@example.com'
})
```

**Email Content:**
- Subject: "Dispute Raised on Shipment CM-1234"
- Body: Includes reason, who raised it, call to action
- Link: Takes to user's dashboard

### Dispute Status Updated

```javascript
emailDisputeUpdated({
  userId: partyId,
  shipmentRef: 'CM-1234',
  newStatus: 'resolved',
  note: 'Refund has been processed...'
})
```

**Email Content:**
- Subject: "Dispute Status Updated - CM-1234"
- Body: New status, admin's resolution note
- Link: Takes to dashboard for details

---

## Testing Guide

### Test Dispute Flow

1. **Setup:**
   - Create shipper account
   - Create carrier account  
   - Create and deliver a shipment

2. **Raise Dispute:**
   - Login as shipper
   - View delivered shipment
   - Click "Raise Dispute"
   - Select reason, add details
   - Submit

3. **Verify:**
   - ✅ Dispute appears in both dashboards
   - ✅ Carrier receives notification
   - ✅ Carrier receives email
   - ✅ Status shows "open"

4. **Admin Review:**
   - Login as admin
   - Go to Disputes tab
   - Find the dispute
   - Update status to "under_review"
   - Add note

5. **Verify:**
   - ✅ Both parties notified
   - ✅ Status updated in dashboards
   - ✅ Emails sent

6. **Resolve:**
   - Admin updates to "resolved"
   - Adds resolution note
   - Submit

7. **Verify:**
   - ✅ Final notifications sent
   - ✅ `resolved_at` timestamp set
   - ✅ Resolution visible to parties

### Test Support Flow

1. **User Sends Message:**
   - Login as user
   - Go to Messages
   - Open "CargoMatch Support"
   - Send message

2. **Verify:**
   - ✅ Thread auto-created
   - ✅ Message appears
   - ✅ Admin dashboard shows unread

3. **Admin Replies:**
   - Login as admin
   - Go to Support tab
   - Select thread
   - Send reply

4. **Verify:**
   - ✅ User receives real-time update
   - ✅ Notification sent
   - ✅ Message marked as read

---

## Troubleshooting

### Dispute Not Appearing

**Check:**
1. Shipment status is "delivered"
2. RLS policies are active
3. User is party to shipment
4. Browser console for errors

**Solution:**
```sql
-- Verify RLS setup
SELECT * FROM pg_policies 
WHERE tablename = 'disputes';
```

### Support Messages Not Sending

**Check:**
1. Thread exists or can be created
2. RLS policies allow insert
3. Real-time is enabled
4. WebSocket connection active

**Solution:**
```sql
-- Check realtime publication
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
AND tablename = 'support_messages';
```

### Admin Can't Update Dispute

**Check:**
1. User has `is_admin = true`
2. Admin policy exists
3. Network connection stable

**Solution:**
```sql
-- Verify admin status
SELECT id, is_admin FROM profiles 
WHERE id = 'admin-user-id';
```

---

## Best Practices

### For Users

1. **Be Specific** - Select the most accurate reason
2. **Provide Context** - Use details field for dates, amounts, specifics
3. **Document Issues** - Take photos if possible (future feature)
4. **Follow Up** - Check for admin responses regularly

### For Admins

1. **Respond Quickly** - Aim for < 2 business days
2. **Be Thorough** - Review full shipment history
3. **Communicate Clearly** - Use resolution notes to explain decisions
4. **Stay Neutral** - Review evidence objectively
5. **Document Everything** - Resolution notes for audit trail

### For Developers

1. **Never Delete Disputes** - Keep for legal/audit purposes
2. **Log All Changes** - Audit trail is critical
3. **Test RLS Policies** - Security is paramount
4. **Monitor Performance** - Index queries appropriately
5. **Handle Errors Gracefully** - User-friendly error messages

---

## Future Enhancements

Potential improvements to consider:

1. **File Attachments** - Allow photos/documents
2. **Dispute Categories** - Better organization
3. **SLA Tracking** - Response time metrics
4. **Escalation** - Priority/urgent disputes
5. **Dispute Templates** - Common resolution patterns
6. **Multi-language** - Support global users
7. **Chat History Export** - Download conversations
8. **Push Notifications** - Mobile alerts
9. **Auto-responses** - Common questions
10. **Satisfaction Ratings** - Measure support quality

---

**Version:** 1.0  
**Last Updated:** April 1, 2026  
**Maintained by:** CargoMatch Development Team
