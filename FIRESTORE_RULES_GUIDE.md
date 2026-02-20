# Firestore Security Rules Guide

## Overview
This document explains the Firestore security rules for the Lecture Assistant application.

## Security Rules Structure

### User Data Protection
- **Path**: `users/{userId}`
- **Access**: Users can only read/write their own user document
- **Requirement**: User must be authenticated and the `userId` must match their `auth.uid`

### Lectures Data Protection
- **Path**: `users/{userId}/lectures/{lectureId}`
- **Access**: Users can only access lectures in their own subcollection
- **Operations**:
  - **Read**: Users can read their own lectures
  - **Create**: Users can create new lectures with required fields (title, status, createdAt)
  - **Update**: Users can update their lectures with specific allowed fields
  - **Delete**: Users can delete their own lectures

## How to Deploy Rules

### Option 1: Using Firebase CLI (Recommended)
```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules
firebase deploy --only storage:rules

# Deploy both
firebase deploy --only firestore:rules,storage:rules
```

### Option 2: Using Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/project/lecture-assistant-ab472)
2. Navigate to **Firestore Database** → **Rules** tab
3. Copy the contents of `firestore.rules`
4. Paste into the rules editor
5. Click **Publish**

## Security Rules Explained

### Authentication Check
```javascript
function isAuthenticated() {
  return request.auth != null;
}
```
Ensures the user is logged in before accessing any data.

### Ownership Check
```javascript
function isOwner(userId) {
  return isAuthenticated() && request.auth.uid == userId;
}
```
Verifies that the user can only access their own data.

### Data Validation
- **Create**: Ensures required fields are present
- **Update**: Only allows updating specific fields (prevents tampering with IDs, timestamps, etc.)

## Testing Rules

You can test your rules in the Firebase Console:
1. Go to **Firestore Database** → **Rules** tab
2. Click **Rules Playground**
3. Test different scenarios:
   - Authenticated user accessing their own data ✅
   - Authenticated user accessing another user's data ❌
   - Unauthenticated user accessing any data ❌

## Important Notes

⚠️ **Never use test mode in production!**
- Test mode allows anyone to read/write your database
- Always deploy proper security rules before going live

✅ **Best Practices**:
- Rules are evaluated server-side (secure)
- Rules are enforced even if client code is bypassed
- Always validate data structure in rules
- Use helper functions for reusable logic

## Current Rules Status

✅ **Firestore Rules**: Created and ready to deploy
✅ **Storage Rules**: Created and ready to deploy (for future use)

## Next Steps

1. **Deploy the rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Test the rules** in Firebase Console Rules Playground

3. **Verify** that users can only access their own data

4. **Monitor** Firestore usage in Firebase Console

