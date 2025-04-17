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
    if (!req.body[field]) {
      res.status(400).json({ error: `Missing required field: ${field}` });
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
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    console.log(`ROUTER: Getting notes for account: ${accountNumber}`);
    const snapshot = await db.collection('notes')
      .where('accountNumber', '==', accountNumber)
      .orderBy('createdAt', 'desc')
      .get();

    const notes = [];
    snapshot.forEach(doc => {
      notes.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate().toISOString() || null,
        updatedAt: doc.data().updatedAt?.toDate().toISOString() || null
      });
    });

    console.log(`ROUTER: Found ${notes.length} notes for account ${accountNumber}`);
    res.status(200).json({ notes });
  } catch (error) {
    console.error('ROUTER: Error getting notes:', error);
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
      accountNumber,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (invoiceId) noteData.invoiceId = invoiceId;
    if (category) noteData.category = category;

    const docRef = await db.collection('notes').add(noteData);
    console.log(`ROUTER: Note added with ID: ${docRef.id}`);

    res.status(201).json({
      id: docRef.id,
      success: true,
      message: 'Note added successfully'
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
    if (!noteId) {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    const { text, category } = req.body;
    if (!text && !category) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (text !== undefined) updateData.text = text; // Allow empty string updates
    if (category !== undefined) updateData.category = category; // Allow setting category

    await db.collection('notes').doc(noteId).update(updateData);
    console.log(`ROUTER: Note ${noteId} updated successfully`);

    res.status(200).json({ success: true, message: 'Note updated successfully' });
  } catch (error) {
    console.error('ROUTER: Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note', details: error.message });
  }
});

// Delete a note
router.delete('/notes/:noteId', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const noteId = req.params.noteId;
    if (!noteId) {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    await db.collection('notes').doc(noteId).delete();
    console.log(`ROUTER: Note ${noteId} deleted successfully`);

    res.status(200).json({ success: true, message: 'Note deleted successfully' });
  } catch (error) {
    console.error('ROUTER: Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note', details: error.message });
  }
});

// ====== BATCH STATUS ENDPOINT (Using InvoiceID) ======

router.post('/batch-status', async (req, res) => {
  if (!ensureDb(res)) return; // Check DB connection

  try {
      // *** CHANGED: Expecting invoiceIds now ***
      const { invoiceIds } = req.body;

      // Validate input: Ensure invoiceIds is an array and not empty
      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
          return res.status(400).json({ error: 'Missing or invalid invoiceIds array in request body.' });
      }
      // Firestore 'in' query limit is 30 - keep this check
      if (invoiceIds.length > 30) {
           console.warn(`ROUTER: /batch-status received ${invoiceIds.length} invoice IDs, exceeding limit of 30.`);
           return res.status(400).json({ error: 'Too many invoice IDs provided. Maximum is 30 per request.' });
      }

      console.log(`ROUTER: /batch-status checking ${invoiceIds.length} invoice IDs.`);

      // --- Firestore Queries (run concurrently) ---
      // Query 1: Check for notes existence using invoiceId
      const notesQuery = db.collection('notes')
          // *** CHANGED: Query by invoiceId ***
          .where('invoiceId', 'in', invoiceIds)
          .select('invoiceId') // Only fetch the invoiceId field
          .get();

      // Query 2: Check for reminders existence using invoiceId
      const remindersQuery = db.collection('reminders')
          // *** CHANGED: Query by invoiceId ***
          .where('invoiceId', 'in', invoiceIds)
          // Optional: Add .where('completed', '==', false) if you only want icons for active reminders
          .select('invoiceId') // Only fetch the invoiceId field
          .get();

      // Wait for both queries to complete
      const [notesSnapshot, remindersSnapshot] = await Promise.all([notesQuery, remindersQuery]);

      // --- Process Results ---
      const existingNoteInvoiceIds = new Set();
      notesSnapshot.forEach(doc => {
          if (doc.data().invoiceId) { // Ensure invoiceId exists on the doc
              existingNoteInvoiceIds.add(doc.data().invoiceId);
          }
      });

      const existingReminderInvoiceIds = new Set();
      remindersSnapshot.forEach(doc => {
           if (doc.data().invoiceId) { // Ensure invoiceId exists on the doc
              existingReminderInvoiceIds.add(doc.data().invoiceId);
           }
      });

      // Build the status map keyed by InvoiceID
      const statusMap = {};
      invoiceIds.forEach(invId => {
          statusMap[invId] = {
              // *** CHANGED: Check using the sets based on invoiceId ***
              hasNote: existingNoteInvoiceIds.has(invId),
              hasReminder: existingReminderInvoiceIds.has(invId)
          };
      });

      console.log(`ROUTER: /batch-status returning status map for ${Object.keys(statusMap).length} invoice IDs.`);
      res.status(200).json(statusMap);

  } catch (error) {
      console.error('ROUTER: /batch-status error:', error);
      res.status(500).json({ error: 'Failed to get batch status', details: error.message });
  }
});

// ====== REMINDERS ENDPOINTS ======

// Get all reminders for an account
router.get('/reminders/:accountNumber', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const accountNumber = req.params.accountNumber;
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    console.log(`ROUTER: Getting reminders for account: ${accountNumber}`);
    const snapshot = await db.collection('reminders')
      .where('accountNumber', '==', accountNumber)
      .orderBy('dueDate', 'asc')
      .get();

    const reminders = [];
    snapshot.forEach(doc => {
      reminders.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate().toISOString() || null,
        dueDate: doc.data().dueDate?.toDate().toISOString() || null // Make sure dueDate is stored as Timestamp
      });
    });

    console.log(`ROUTER: Found ${reminders.length} reminders for account ${accountNumber}`);
    res.status(200).json({ reminders });
  } catch (error) {
    console.error('ROUTER: Error getting reminders:', error);
    res.status(500).json({ error: 'Failed to get reminders', details: error.message });
  }
});

// Add a new reminder
router.post('/reminders', async (req, res) => {
  if (!ensureDb(res)) return;
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
      accountNumber,
      text,
      dueDate: dueDateTimestamp,
      completed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (invoiceId) reminderData.invoiceId = invoiceId;
    // Handle 'none' or empty string for recurring
    if (recurring && recurring !== 'none') reminderData.recurring = recurring;

    const docRef = await db.collection('reminders').add(reminderData);
    console.log(`ROUTER: Reminder added with ID: ${docRef.id}`);

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
    if (!reminderId) {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    const { text, dueDate, completed, recurring } = req.body;
    // Check if at least one field is provided for update
    if (text === undefined && dueDate === undefined && completed === undefined && recurring === undefined) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    const updateData = {};

    if (text !== undefined) updateData.text = text;

    if (dueDate !== undefined) {
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
        updateData.recurring = (recurring && recurring !== 'none') ? recurring : null;
    }


    await db.collection('reminders').doc(reminderId).update(updateData);
    console.log(`ROUTER: Reminder ${reminderId} updated successfully`);

    res.status(200).json({ success: true, message: 'Reminder updated successfully' });
  } catch (error) {
    console.error('ROUTER: Error updating reminder:', error);
    res.status(500).json({ error: 'Failed to update reminder', details: error.message });
  }
});

// Mark a reminder as complete
router.put('/reminders/:reminderId/complete', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const reminderId = req.params.reminderId;
    if (!reminderId) {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    await db.collection('reminders').doc(reminderId).update({
      completed: true,
      // Optionally update an 'updatedAt' timestamp here too
      // updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`ROUTER: Reminder ${reminderId} marked as complete`);

    res.status(200).json({ success: true, message: 'Reminder marked as complete' });
  } catch (error) {
    console.error('ROUTER: Error completing reminder:', error);
    res.status(500).json({ error: 'Failed to complete reminder', details: error.message });
  }
});

// Delete a reminder
router.delete('/reminders/:reminderId', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const reminderId = req.params.reminderId;
    if (!reminderId) {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    await db.collection('reminders').doc(reminderId).delete();
    console.log(`ROUTER: Reminder ${reminderId} deleted successfully`);

    res.status(200).json({ success: true, message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error('ROUTER: Error deleting reminder:', error);
    res.status(500).json({ error: 'Failed to delete reminder', details: error.message });
  }
});


// ====== MOUNT THE ROUTER ONTO THE MAIN APP WITH THE PREFIX ======
// All requests starting with /api/firebase-api will be handled by the router
app.use('/api/firebase-api', router); // <-- IMPORTANT: Mount router here


// Handle 404 - Routes not matched on the main app (including those not starting with /api/firebase-api)
app.use((req, res) => {
  console.log('APP 404: Route not found:', req.method, req.path);
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Export the serverless handler for the main app instance
exports.handler = serverless(app);