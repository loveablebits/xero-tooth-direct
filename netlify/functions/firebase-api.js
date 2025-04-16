// netlify/functions/firebase-api.js
const admin = require('firebase-admin');
const cors = require('cors');
const express = require('express');
const serverless = require('serverless-http');

// Initialize Express
const app = express();

// Enable CORS
app.use(cors());
app.use(express.json());

// Add logging for debugging
app.use((req, res, next) => {
  console.log('Firebase API request:', req.method, req.path);
  next();
});

// Initialize Firebase admin (only once)
let firebaseApp;
if (!firebaseApp) {
  console.log('Initializing Firebase admin with project ID:', process.env.FIREBASE_PROJECT_ID);
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
    console.log('Firebase admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase admin:', error);
    throw error;
  }
}

// Get database reference
const db = admin.firestore();

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

// ====== NOTES ENDPOINTS ======

// Get all notes for an account
app.get('/notes/:accountNumber', async (req, res) => {
  try {
    const accountNumber = req.params.accountNumber;
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    console.log(`Getting notes for account: ${accountNumber}`);
    const snapshot = await db.collection('notes')
      .where('accountNumber', '==', accountNumber)
      .orderBy('createdAt', 'desc')
      .get();

    const notes = [];
    snapshot.forEach(doc => {
      notes.push({
        id: doc.id,
        ...doc.data(),
        // Convert timestamps to ISO strings for JSON serialization
        createdAt: doc.data().createdAt?.toDate().toISOString() || null,
        updatedAt: doc.data().updatedAt?.toDate().toISOString() || null
      });
    });

    console.log(`Found ${notes.length} notes for account ${accountNumber}`);
    res.status(200).json({ notes });
  } catch (error) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a new note
app.post('/notes', async (req, res) => {
  try {
    if (!validateRequest(req, res, ['accountNumber', 'text'])) return;

    const { accountNumber, invoiceId, text, category } = req.body;
    console.log(`Adding note for account: ${accountNumber}`);
    
    const noteData = {
      accountNumber,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Add optional fields if they exist
    if (invoiceId) noteData.invoiceId = invoiceId;
    if (category) noteData.category = category;

    const docRef = await db.collection('notes').add(noteData);
    console.log(`Note added with ID: ${docRef.id}`);
    
    res.status(201).json({ 
      id: docRef.id,
      success: true, 
      message: 'Note added successfully'
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a note
app.put('/notes/:noteId', async (req, res) => {
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

    if (text) updateData.text = text;
    if (category) updateData.category = category;

    await db.collection('notes').doc(noteId).update(updateData);
    console.log(`Note ${noteId} updated successfully`);
    
    res.status(200).json({ success: true, message: 'Note updated successfully' });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a note
app.delete('/notes/:noteId', async (req, res) => {
  try {
    const noteId = req.params.noteId;
    if (!noteId) {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    await db.collection('notes').doc(noteId).delete();
    console.log(`Note ${noteId} deleted successfully`);
    
    res.status(200).json({ success: true, message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message });
  }
});

// ====== REMINDERS ENDPOINTS ======

// Get all reminders for an account
app.get('/reminders/:accountNumber', async (req, res) => {
  try {
    const accountNumber = req.params.accountNumber;
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    console.log(`Getting reminders for account: ${accountNumber}`);
    const snapshot = await db.collection('reminders')
      .where('accountNumber', '==', accountNumber)
      .orderBy('dueDate', 'asc')
      .get();

    const reminders = [];
    snapshot.forEach(doc => {
      reminders.push({
        id: doc.id,
        ...doc.data(),
        // Convert timestamps to ISO strings for JSON serialization
        createdAt: doc.data().createdAt?.toDate().toISOString() || null,
        dueDate: doc.data().dueDate?.toDate().toISOString() || null
      });
    });

    console.log(`Found ${reminders.length} reminders for account ${accountNumber}`);
    res.status(200).json({ reminders });
  } catch (error) {
    console.error('Error getting reminders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a new reminder
app.post('/reminders', async (req, res) => {
  try {
    if (!validateRequest(req, res, ['accountNumber', 'text', 'dueDate'])) return;

    const { accountNumber, invoiceId, text, dueDate, recurring } = req.body;
    console.log(`Adding reminder for account: ${accountNumber}`);
    
    // Parse dueDate string to Firestore timestamp
    let dueDateTimestamp;
    try {
      dueDateTimestamp = admin.firestore.Timestamp.fromDate(new Date(dueDate));
    } catch (e) {
      return res.status(400).json({ error: 'Invalid due date format' });
    }
    
    const reminderData = {
      accountNumber,
      text,
      dueDate: dueDateTimestamp,
      completed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Add optional fields if they exist
    if (invoiceId) reminderData.invoiceId = invoiceId;
    if (recurring) reminderData.recurring = recurring;

    const docRef = await db.collection('reminders').add(reminderData);
    console.log(`Reminder added with ID: ${docRef.id}`);
    
    res.status(201).json({ 
      id: docRef.id,
      success: true, 
      message: 'Reminder added successfully'
    });
  } catch (error) {
    console.error('Error adding reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a reminder
app.put('/reminders/:reminderId', async (req, res) => {
  try {
    const reminderId = req.params.reminderId;
    if (!reminderId) {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    const { text, dueDate, completed, recurring } = req.body;
    if (!text && dueDate === undefined && completed === undefined && !recurring) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updateData = {};

    if (text) updateData.text = text;
    
    if (dueDate) {
      try {
        updateData.dueDate = admin.firestore.Timestamp.fromDate(new Date(dueDate));
      } catch (e) {
        return res.status(400).json({ error: 'Invalid due date format' });
      }
    }
    
    if (completed !== undefined) updateData.completed = completed;
    if (recurring) updateData.recurring = recurring;

    await db.collection('reminders').doc(reminderId).update(updateData);
    console.log(`Reminder ${reminderId} updated successfully`);
    
    res.status(200).json({ success: true, message: 'Reminder updated successfully' });
  } catch (error) {
    console.error('Error updating reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark a reminder as complete
app.put('/reminders/:reminderId/complete', async (req, res) => {
  try {
    const reminderId = req.params.reminderId;
    if (!reminderId) {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    await db.collection('reminders').doc(reminderId).update({
      completed: true
    });
    console.log(`Reminder ${reminderId} marked as complete`);
    
    res.status(200).json({ success: true, message: 'Reminder marked as complete' });
  } catch (error) {
    console.error('Error completing reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a reminder
app.delete('/reminders/:reminderId', async (req, res) => {
  try {
    const reminderId = req.params.reminderId;
    if (!reminderId) {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }

    await db.collection('reminders').doc(reminderId).delete();
    console.log(`Reminder ${reminderId} deleted successfully`);
    
    res.status(200).json({ success: true, message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle 404 - not found
app.use((req, res) => {
  console.log('Route not found:', req.method, req.path);
  res.status(404).json({ error: 'Not found' });
});

// Export the serverless handler
// The { basePath: '' } is important here to make Express work with serverless properly
exports.handler = serverless(app);