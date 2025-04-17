// netlify/functions/firebase-api.js
const admin = require('firebase-admin');
const cors = require('cors');
const express = require('express');
const serverless = require('serverless-http');

// Initialize Express
const app = express();
const router = express.Router(); // <-- Create a router

// Apply middleware to the main app instance
app.use(cors()); // Enable CORS for all requests to the function
app.use(express.json()); // Enable JSON body parsing

// Add logging middleware to see incoming requests on the main app
app.use((req, res, next) => {
  // Avoid logging favicon requests if they somehow reach here
  if (req.path.includes('favicon.ico')) {
     return res.status(204).end();
  }
  console.log('Firebase API request Received:', req.method, req.path);
  next();
});

// Initialize Firebase admin (only once)
// --- Make sure your Netlify environment variables are set: ---
// FIREBASE_PROJECT_ID
// FIREBASE_CLIENT_EMAIL
// FIREBASE_PRIVATE_KEY
let firebaseAppInitialized = false;
if (admin.apps.length === 0) { // Check if already initialized
    console.log('Attempting to initialize Firebase admin...');
    console.log('Using Project ID:', process.env.FIREBASE_PROJECT_ID ? 'Exists' : 'MISSING!');
    console.log('Using Client Email:', process.env.FIREBASE_CLIENT_EMAIL ? 'Exists' : 'MISSING!');
    console.log('Using Private Key:', process.env.FIREBASE_PRIVATE_KEY ? 'Exists' : 'MISSING!');

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        console.error("FIREBASE ENVIRONMENT VARIABLES ARE MISSING!");
        // Optionally throw an error or handle this case if needed,
        // but logging is essential for debugging deployment.
    } else {
        try {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    // Replace escaped newlines in the private key from environment variable
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                })
            });
            firebaseAppInitialized = true;
            console.log('Firebase admin initialized successfully.');
        } catch (error) {
            console.error('CRITICAL: Error initializing Firebase admin:', error);
            // Depending on your needs, you might want to prevent the app from proceeding
        }
    }
} else {
    firebaseAppInitialized = true; // Already initialized
    console.log('Firebase admin was already initialized.');
}

// Get database reference (only if initialized)
const db = firebaseAppInitialized ? admin.firestore() : null;

// Helper function to check DB connection and handle errors
const ensureDb = (res) => {
    if (!db) {
        console.error("Firestore database reference is not available. Initialization likely failed.");
        res.status(500).json({ error: 'Database connection failed. Check function logs.' });
        return false;
    }
    return true;
};


// Helper to validate request data
const validateRequest = (req, res, requiredFields) => {
  for (const field of requiredFields) {
    // Check if the field exists and is not just whitespace (for strings)
    if (!req.body[field] || (typeof req.body[field] === 'string' && req.body[field].trim() === '')) {
      console.warn(`Validation failed: Missing or empty required field: ${field}`);
      res.status(400).json({ error: `Missing or invalid required field: ${field}` });
      return false;
    }
  }
  return true;
};

// ====== DEFINE ROUTES ON THE **ROUTER** ======
// (Paths here are relative to the '/api/firebase-api' prefix we'll add later)

// ====== NOTES ENDPOINTS ======

// Get all notes for an account
router.get('/notes/:accountNumber', async (req, res) => {
  if (!ensureDb(res)) return; // Check DB connection

  try {
    const accountNumber = req.params.accountNumber;
    if (!accountNumber || accountNumber.trim() === '') {
      return res.status(400).json({ error: 'Account number is required' });
    }

    console.log(`ROUTER: Getting notes for account: ${accountNumber}`);
    const snapshot = await db.collection('notes')
      .where('accountNumber', '==', accountNumber)
      .orderBy('createdAt', 'desc') // Requires index: accountNumber ASC, createdAt DESC
      .get();

    const notes = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      notes.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
      });
    });

    console.log(`ROUTER: Found ${notes.length} notes for account ${accountNumber}`);
    res.status(200).json({ notes });
  } catch (error) {
    console.error(`ROUTER: Error getting notes for ${req.params.accountNumber}:`, error);
    res.status(500).json({ error: 'Failed to get notes', details: error.message });
  }
});

// Add a new note
router.post('/notes', async (req, res) => {
  if (!ensureDb(res)) return;
  if (!validateRequest(req, res, ['accountNumber', 'text'])) return;

  try {
    const { accountNumber, invoiceId, text, category } = req.body;
    console.log(`ROUTER: Adding note for account: ${accountNumber}`);

    const noteData = {
      accountNumber: String(accountNumber), // Ensure it's a string
      text: String(text),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (invoiceId) noteData.invoiceId = String(invoiceId);
    if (category) noteData.category = String(category);

    const docRef = await db.collection('notes').add(noteData);
    console.log(`ROUTER: Note added with ID: ${docRef.id} for account ${accountNumber}`);

    // Return the newly created note's ID and data
    res.status(201).json({
      id: docRef.id,
      success: true,
      message: 'Note added successfully',
      // You could optionally fetch and return the full note data here if needed by the client
    });
  } catch (error) {
    console.error('ROUTER: Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note', details: error.message });
  }
});

// Update a note
router.put('/notes/:noteId', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const noteId = req.params.noteId;
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    const { text, category } = req.body;
    // Allow updating even if only one field is sent
    if (text === undefined && category === undefined) {
      return res.status(400).json({ error: 'No fields provided to update (text or category)' });
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Only include fields in the update if they were actually provided in the request body
    if (text !== undefined) updateData.text = String(text); // Allow empty string updates
    if (category !== undefined) updateData.category = String(category); // Allow setting category

    await db.collection('notes').doc(noteId).update(updateData);
    console.log(`ROUTER: Note ${noteId} updated successfully`);

    res.status(200).json({ success: true, message: 'Note updated successfully' });
  } catch (error) {
    console.error(`ROUTER: Error updating note ${req.params.noteId}:`, error);
    // Handle potential "not found" errors during update
    if (error.code === 5) { // Firestore error code for NOT_FOUND
        return res.status(404).json({ error: 'Note not found', details: error.message });
    }
    res.status(500).json({ error: 'Failed to update note', details: error.message });
  }
});

// Delete a note
router.delete('/notes/:noteId', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const noteId = req.params.noteId;
    if (!noteId || noteId.trim() === '') {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    await db.collection('notes').doc(noteId).delete();
    console.log(`ROUTER: Note ${noteId} deleted successfully`);

    res.status(200).json({ success: true, message: 'Note deleted successfully' });
  } catch (error) {
    console.error(`ROUTER: Error deleting note ${req.params.noteId}:`, error);
     // Handle potential "not found" errors during delete (optional, delete is often idempotent)
    res.status(500).json({ error: 'Failed to delete note', details: error.message });
  }
});

// ====== REMINDERS ENDPOINTS ======

// Get all reminders for an account
router.get('/reminders/:accountNumber', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const accountNumber = req.params.accountNumber;
    if (!accountNumber || accountNumber.trim() === '') {
      return res.status(400).json({ error: 'Account number is required' });
    }

    console.log(`ROUTER: Getting reminders for account: ${accountNumber}`);
    const snapshot = await db.collection('reminders')
      .where('accountNumber', '==', accountNumber)
      .orderBy('dueDate', 'asc') // Requires index: accountNumber ASC, dueDate ASC
      .get();

    const reminders = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        reminders.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
            dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : null // Make sure dueDate is stored as Timestamp
        });
    });

    console.log(`ROUTER: Found ${reminders.length} reminders for account ${accountNumber}`);
    res.status(200).json({ reminders });
  } catch (error) {
    console.error(`ROUTER: Error getting reminders for ${req.params.accountNumber}:`, error);
    res.status(500).json({ error: 'Failed to get reminders', details: error.message });
  }
});

// Add a new reminder
router.post('/reminders', async (req, res) => {
  if (!ensureDb(res)) return;
  // Due date is crucial for reminders
  if (!validateRequest(req, res, ['accountNumber', 'text', 'dueDate'])) return;

  try {
    const { accountNumber, invoiceId, text, dueDate, recurring } = req.body;
    console.log(`ROUTER: Adding reminder for account: ${accountNumber}`);

    let dueDateTimestamp;
    try {
      // Assuming dueDate is sent as an ISO string (e.g., "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss.sssZ")
      const dateObj = new Date(dueDate);
      if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date value');
      }
      dueDateTimestamp = admin.firestore.Timestamp.fromDate(dateObj);
    } catch (e) {
      console.error("Invalid due date format received:", dueDate, e);
      return res.status(400).json({ error: 'Invalid due date format. Please use YYYY-MM-DD or a full ISO string.' });
    }

    const reminderData = {
      accountNumber: String(accountNumber),
      text: String(text),
      dueDate: dueDateTimestamp,
      completed: false, // Default to not completed
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (invoiceId) reminderData.invoiceId = String(invoiceId);
    // Handle 'none' or empty string for recurring, store null if not provided or 'none'
    if (recurring && recurring !== 'none' && String(recurring).trim() !== '') {
         reminderData.recurring = String(recurring);
    } else {
         reminderData.recurring = null;
    }


    const docRef = await db.collection('reminders').add(reminderData);
    console.log(`ROUTER: Reminder added with ID: ${docRef.id} for account ${accountNumber}`);

    res.status(201).json({
      id: docRef.id,
      success: true,
      message: 'Reminder added successfully'
    });
  } catch (error) {
    console.error('ROUTER: Error adding reminder:', error);
    res.status(500).json({ error: 'Failed to add reminder', details: error.message });
  }
});

// Update a reminder
router.put('/reminders/:reminderId', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const reminderId = req.params.reminderId;
    if (!reminderId || reminderId.trim() === '') {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    const { text, dueDate, completed, recurring } = req.body;
    // Check if at least one field is provided for update
    if (text === undefined && dueDate === undefined && completed === undefined && recurring === undefined) {
      return res.status(400).json({ error: 'No fields provided to update (text, dueDate, completed, or recurring)' });
    }

    const updateData = {
        // Always update the 'updatedAt' timestamp on any change
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (text !== undefined) updateData.text = String(text);

    if (dueDate !== undefined) {
      // Allow setting dueDate to null? Decide based on requirements. For now, assume valid date needed.
      if (dueDate === null) {
         return res.status(400).json({ error: 'Due date cannot be set to null via update. Delete and recreate if needed.' });
      }
      try {
        const dateObj = new Date(dueDate);
        if (isNaN(dateObj.getTime())) {
            throw new Error('Invalid date value');
        }
        updateData.dueDate = admin.firestore.Timestamp.fromDate(dateObj);
      } catch (e) {
        console.error("Invalid due date format for update:", dueDate, e);
        return res.status(400).json({ error: 'Invalid due date format for update. Please use YYYY-MM-DD or a full ISO string.' });
      }
    }

    if (completed !== undefined) updateData.completed = Boolean(completed); // Ensure boolean

    // Handle recurring update, allow setting to null or empty string to remove it
    if (recurring !== undefined) {
        updateData.recurring = (recurring && recurring !== 'none' && String(recurring).trim() !== '') ? String(recurring) : null;
    }


    await db.collection('reminders').doc(reminderId).update(updateData);
    console.log(`ROUTER: Reminder ${reminderId} updated successfully`);

    res.status(200).json({ success: true, message: 'Reminder updated successfully' });
  } catch (error) {
    console.error(`ROUTER: Error updating reminder ${req.params.reminderId}:`, error);
     // Handle potential "not found" errors during update
    if (error.code === 5) { // Firestore error code for NOT_FOUND
        return res.status(404).json({ error: 'Reminder not found', details: error.message });
    }
    res.status(500).json({ error: 'Failed to update reminder', details: error.message });
  }
});

// Mark a reminder as complete
router.put('/reminders/:reminderId/complete', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const reminderId = req.params.reminderId;
    if (!reminderId || reminderId.trim() === '') {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    await db.collection('reminders').doc(reminderId).update({
      completed: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() // Also update timestamp
    });
    console.log(`ROUTER: Reminder ${reminderId} marked as complete`);

    res.status(200).json({ success: true, message: 'Reminder marked as complete' });
  } catch (error) {
    console.error(`ROUTER: Error completing reminder ${req.params.reminderId}:`, error);
     // Handle potential "not found" errors during update
    if (error.code === 5) { // Firestore error code for NOT_FOUND
        return res.status(404).json({ error: 'Reminder not found', details: error.message });
    }
    res.status(500).json({ error: 'Failed to complete reminder', details: error.message });
  }
});

// Delete a reminder
router.delete('/reminders/:reminderId', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const reminderId = req.params.reminderId;
    if (!reminderId || reminderId.trim() === '') {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    await db.collection('reminders').doc(reminderId).delete();
    console.log(`ROUTER: Reminder ${reminderId} deleted successfully`);

    res.status(200).json({ success: true, message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error(`ROUTER: Error deleting reminder ${req.params.reminderId}:`, error);
    res.status(500).json({ error: 'Failed to delete reminder', details: error.message });
  }
});


// ====== ** NEW BATCH STATUS ENDPOINT ** ======
router.post('/batch-status', async (req, res) => {
  if (!ensureDb(res)) return; // Check DB connection first

  try {
    const { accountNumbers } = req.body;

    // Basic validation
    if (!Array.isArray(accountNumbers) || accountNumbers.length === 0) {
      console.warn('batch-status called with invalid/empty accountNumbers array');
      return res.status(400).json({ error: 'Missing or invalid accountNumbers array in request body.' });
    }
    // Firestore 'in' query limit is 30 elements per query segment,
    // but the SDK handles breaking larger arrays into multiple queries automatically.
    // Warn if excessively large arrays are sent, as it impacts performance/cost.
    if (accountNumbers.length > 500) {
        console.warn("batch-status called with a large number of accounts:", accountNumbers.length);
    }

    // Filter out any potential null/empty values just in case
    const validAccountNumbers = accountNumbers.filter(accNum => accNum && typeof accNum === 'string' && accNum.trim() !== '');
    if (validAccountNumbers.length === 0) {
        console.warn('batch-status called, but no valid account numbers remained after filtering.');
        return res.status(200).json({}); // Return empty map if no valid accounts
    }

    console.log(`ROUTER: batch-status checking for ${validAccountNumbers.length} valid accounts.`);

    // Use Promise.allSettled to ensure both queries complete even if one fails
    // (though Firestore SDK handles 'in' splitting, good practice for independent ops)
    const results = await Promise.allSettled([
      db.collection('notes')
        .where('accountNumber', 'in', validAccountNumbers)
        .select('accountNumber') // Only fetch the account number field
        .limit(validAccountNumbers.length * 2) // Limit reads just in case (generous limit)
        .get(),
      db.collection('reminders')
        .where('accountNumber', 'in', validAccountNumbers)
        .select('accountNumber') // Only fetch the account number field
        .limit(validAccountNumbers.length * 2) // Limit reads just in case (generous limit)
        .get()
    ]);

    // Process results into a map
    const statusMap = {};
    // Initialize map with false for all VALID requested accounts
    validAccountNumbers.forEach(accNum => {
      statusMap[accNum] = { hasNote: false, hasReminder: false };
    });

    // Process notes results
    if (results[0].status === 'fulfilled') {
        const notesSnapshot = results[0].value;
        notesSnapshot.forEach(doc => {
          const accNum = doc.data().accountNumber;
          if (statusMap[accNum] !== undefined) { // Check if it was one of the requested accounts
             statusMap[accNum].hasNote = true;
          }
        });
    } else {
        console.error("ROUTER: batch-status failed to query notes:", results[0].reason);
        // Decide how to handle partial failure - perhaps return partial data or a specific error
        // For now, we continue and return potentially incomplete status for notes
    }

    // Process reminders results
    if (results[1].status === 'fulfilled') {
        const remindersSnapshot = results[1].value;
        remindersSnapshot.forEach(doc => {
           const accNum = doc.data().accountNumber;
            if (statusMap[accNum] !== undefined) { // Check if it was one of the requested accounts
                statusMap[accNum].hasReminder = true;
            }
        });
    } else {
         console.error("ROUTER: batch-status failed to query reminders:", results[1].reason);
         // Decide how to handle partial failure
    }


    console.log(`ROUTER: batch-status completed. Returning map for ${Object.keys(statusMap).length} accounts.`);
    res.status(200).json(statusMap);

  } catch (error) {
    // Catch any unexpected errors during the process
    console.error('ROUTER: Unexpected error in batch-status:', error);
    res.status(500).json({ error: 'Failed to check batch status due to an unexpected error', details: error.message });
  }
});


// ====== MOUNT THE ROUTER ONTO THE MAIN APP WITH THE PREFIX ======
// All requests starting with /api/firebase-api will be handled by the router
app.use('/api/firebase-api', router); // <-- IMPORTANT: Mount router here


// Handle 404 - Routes not matched on the main app (e.g., /api/unknown-route)
// This will catch requests that don't match '/api/firebase-api/*' or other potential top-level routes
app.use((req, res) => {
  console.log('APP 404: Route not found:', req.method, req.path);
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Export the serverless handler for the main app instance
exports.handler = serverless(app);