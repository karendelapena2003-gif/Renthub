# RentHub Support System Documentation

## Overview
RentHub Support System enables renters and owners to contact the admin team with AI-powered auto-replies. The support button is integrated directly into the chat window for seamless access during conversations.

## ✨ NEW FEATURES (Updated Design)

### 🎯 **Integrated Support Button**
- **Location**: Inside the chat header (when chatting with owner/renter)
- **Behavior**: Opens a beautiful modal overlay instead of switching conversations
- **Design**: Red button (🆘 RentHub Support) with modern styling

### 🤖 **Intelligent AI Auto-Replies**
The system now analyzes user messages and provides context-specific answers:

#### **For Renters:**
- **Payment issues**: GCash & COD payment instructions
- **Cancellation/Refunds**: Cancellation process and refund timeline
- **Owner Communication**: How to message property owners
- **Property Availability**: Browsing and filtering properties
- **Account Settings**: Profile updates and password reset
- **How-to Guide**: Step-by-step rental process

#### **For Owners:**
- **Withdrawal issues**: ₱500 minimum, GCash payout process
- **Earnings tracking**: Automatic updates and Individual Earnings
- **Property Management**: Listing approval and requirements
- **Renter Communication**: Response best practices
- **Rental Approval**: How to approve/reject requests
- **Account Settings**: GCash number updates
- **How-to Guide**: Step-by-step property management

## User Experience Flow

### **Renter/Owner Submitting Support:**
1. Open Messages section
2. Select any conversation (owner/renter)
3. Click **"🆘 RentHub Support"** button in chat header
4. Modal overlay appears with:
   - Common topics list
   - Large text area for issue description
   - AI auto-reply explanation
   - Beautiful gradient submit button
5. Type issue description (e.g., "How do I pay using GCash?")
6. Click "Send to Support & Get AI Reply"
7. System automatically:
   - Analyzes keywords in the message
   - Sends targeted AI auto-reply
   - Creates support ticket for admin
   - Shows success message
8. User can view AI response in Messages (renthub-support conversation)

### 3. **Admin Dashboard - Support Ticket Management**
- **Location**: `src/pages/AdminDashboard.js`
- **Feature**: New "Support Tickets" section accessible from dashboard overview
- **Functionality**:
  - View all open support tickets from owners and renters
  - See ticket details (sender, role, priority, message, timestamp)
  - Send responses to users
  - Mark tickets as:
    - 🔴 Open
    - 🟡 In Progress
    - 🟢 Resolved
  - Automatic status updates when replying
  - Reply count: Shows number of open tickets on dashboard card

## Firestore Collections

### **support_tickets**
```javascript
{
  ticketId: "TICKET-1234567890",      // Unique ticket identifier
  sender: "renter@email.com",          // User's email
  senderRole: "renter" or "owner",     // User type
  senderName: "John Doe",              // Display name
  message: "Issue description...",     // Full issue text
  status: "open|in-progress|resolved", // Ticket status
  priority: "normal|urgent",           // Priority level
  adminReply: "Response text...",      // Admin's response (optional)
  adminRepliedAt: Timestamp,           // When admin replied
  createdAt: Timestamp,                // When ticket was created
  updatedAt: Timestamp,                // Last update time
}
```

### **messages** (Updated)
Support messages are stored in the regular messages collection with special routing:
- **Receiver**: `"renthub-support"` for support tickets
- **isAutoReply**: `true` flag for automatic responses
- **userRole**: Indicates if sender is "owner" or "renter"
- **status**: Message status ("pending", "sent", etc.)

## User Flow

### Owner/Renter Submitting Support Ticket:
1. Navigate to Messages section
2. Click "🆘 Chat with RentHub Support" button
3. Type issue description in chat input
4. Click Send
5. System automatically:
   - Creates support_tickets document
   - Sends message to Firestore
   - Sends immediate auto-reply
   - Updates local message list

### Admin Responding to Ticket:
1. Click Support Tickets card on dashboard overview
2. View list of open tickets on the left
3. Click a ticket to view full details
4. Click "⏳ Mark as In Progress" to start working
5. Type response in the reply section
6. Click "Send Response" to:
   - Send message to user's inbox
   - Update ticket status to "in-progress"
   - Update ticket with admin's response
7. Click "✅ Mark as Resolved" when done

## Technical Implementation

### Auto-Reply Logic
- Triggered automatically when user sends support message
- Contains pre-written message: "🤖 Thank you for contacting RentHub Support!..."
- Uses `isAutoReply: true` flag for identification
- Visually distinguished with yellow background (#fff3cd) and 🤖 label

### Real-time Updates
- AdminDashboard uses `onSnapshot` listener for support_tickets collection
- Automatic refresh when new tickets arrive
- Ticket list updates in real-time as status changes

### State Management
**OwnerDashboard/RenterDashboard**:
- Uses regular message state with conditional routing
- `selectedChat === "renthub-support"` triggers support flow
- `replyText` state object stores input per chat

**AdminDashboard**:
- `supportTickets`: Array of all support tickets
- `selectedTicket`: Currently viewed ticket
- `ticketReplyText`: Reply text per ticket (object with ticketId as key)

### Handler Functions
**OwnerDashboard/RenterDashboard**:
- `handleSupportMessage()`: Sends message + creates ticket + sends auto-reply

**AdminDashboard**:
- `updateTicketStatus(ticketId, newStatus)`: Updates ticket status in Firestore
- `handleSendTicketReply(ticket)`: Sends response + updates ticket + changes status

## Styling
- Support button: Red background (#ff6b6b), white text, 🆘 emoji
- Auto-reply messages: Yellow background (#fff3cd), left border in gold
- Support section: Clean two-column layout (tickets list + details)
- Responsive: Single column on mobile (< 768px)

## CSS Files Modified
- `AdminDashboard.css`: Added .support-tickets-section, .support-container, .tickets-list, .ticket-details, .ticket-header, .status-badge, .admin-reply-section styles

## Error Handling
- Empty message validation
- Try-catch blocks for Firestore operations
- User alerts for failed operations
- Graceful handling of null/undefined values

## Future Enhancements
- Priority-based sorting (urgent tickets shown first)
- Search/filter by sender or ticket ID
- Ticket categories (billing, account, property, etc.)
- Average response time metrics
- Auto-close after resolution
- Notification badges for new tickets
- Attachment support for screenshots
- Rating/feedback system for support quality

## Testing Checklist
- [ ] Owner can send support message
- [ ] Renter can send support message
- [ ] Auto-reply receives immediately after message
- [ ] Support ticket appears in AdminDashboard
- [ ] Admin can view ticket details
- [ ] Admin can mark ticket as In Progress
- [ ] Admin can send response
- [ ] User receives admin response in messages
- [ ] Admin can mark ticket as Resolved
- [ ] Firestore documents created correctly
- [ ] Real-time listeners update properly
- [ ] Mobile view works correctly
