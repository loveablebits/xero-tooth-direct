// Global variables for notes and reminders
let currentNotes = [];
let currentReminders = [];
let currentInvoiceId = null;
let currentAccountNumber = null;

// Initialize tabs system
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to current button and corresponding content
      button.classList.add('active');
      const tabId = button.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });
}

// Format date for display
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid date';
  
  return date.toLocaleString();
}

// Get relative time string
function getRelativeTimeString(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else if (diffDays > 1 && diffDays < 7) {
    return `In ${diffDays} days`;
  } else if (diffDays === -1) {
    return 'Yesterday';
  } else if (diffDays < -1 && diffDays > -7) {
    return `${Math.abs(diffDays)} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Get reminder status
function getReminderStatus(dueDate, completed) {
  if (completed) return 'completed';
  
  if (!dueDate) return 'pending';
  
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return 'pending';
  
  const now = new Date();
  
  // Reset time to compare dates only
  now.setHours(0, 0, 0, 0);
  const dueDateOnly = new Date(due);
  dueDateOnly.setHours(0, 0, 0, 0);
  
  if (dueDateOnly.getTime() === now.getTime()) {
    return 'due-today';
  } else if (dueDateOnly < now) {
    return 'overdue';
  } else {
    return 'pending';
  }
}

// ------------------------
// Notes Functions
// ------------------------

// Fetch notes for an account
async function fetchNotes(accountNumber) {
  try {
    toggleLoading('notes-list', true);
    
    const response = await fetch(`/api/firebase-api/notes/${accountNumber}`);
    if (!response.ok) {
      throw new Error(`Error fetching notes: ${response.status}`);
    }
    
    const data = await response.json();
    currentNotes = data.notes || [];
    
    displayNotes();
  } catch (error) {
    console.error('Error fetching notes:', error);
    showError('notes-list', 'Failed to load notes. Please try again.');
  } finally {
    toggleLoading('notes-list', false);
  }
}

// Display notes
function displayNotes() {
  const notesList = document.getElementById('notes-list');
  
  if (!notesList) {
    console.error('Notes list element not found');
    return;
  }
  
  // Clear previous content
  notesList.innerHTML = '';
  
  if (currentNotes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <p>No notes found for this account.</p>
        <p>Add a note using the form below.</p>
      </div>
    `;
    return;
  }
  
  // Sort notes by created date (newest first)
  currentNotes.sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  // Create note cards
  currentNotes.forEach(note => {
    const categoryClass = note.category ? `category-${note.category.toLowerCase()}` : 'category-general';
    const categoryLabel = note.category || 'General';
    
    const noteCard = document.createElement('div');
    noteCard.className = 'item-card';
    noteCard.dataset.id = note.id;
    
    noteCard.innerHTML = `
      <div class="item-header">
        <div>
          <span class="note-category ${categoryClass}">${categoryLabel}</span>
          <span class="item-date">${formatDate(note.createdAt)}</span>
        </div>
        <div class="item-actions">
          <button class="item-action-btn edit" title="Edit Note">✏️</button>
          <button class="item-action-btn delete" title="Delete Note">🗑️</button>
        </div>
      </div>
      <div class="item-content">${note.text}</div>
    `;
    
    // Add event listeners
    noteCard.querySelector('.edit').addEventListener('click', () => editNote(note.id));
    noteCard.querySelector('.delete').addEventListener('click', () => deleteNote(note.id));
    
    notesList.appendChild(noteCard);
  });
}

// Add a new note
async function addNote(event) {
  event.preventDefault();
  
  const textArea = document.getElementById('note-text');
  const categorySelect = document.getElementById('note-category');
  
  const text = textArea.value.trim();
  const category = categorySelect.value;
  
  if (!text) {
    alert('Please enter a note');
    return;
  }
  
  if (!currentAccountNumber) {
    alert('No account associated with this invoice');
    return;
  }
  
  try {
    const response = await fetch('/api/firebase-api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountNumber: currentAccountNumber,
        invoiceId: currentInvoiceId,
        text,
        category: category === 'general' ? null : category
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add note: ${response.status}`);
    }
    
    // Clear the form
    textArea.value = '';
    categorySelect.value = 'general';
    
    // Refresh notes
    await fetchNotes(currentAccountNumber);
    
    // Show success message
    showMessage('Note added successfully');
  } catch (error) {
    console.error('Error adding note:', error);
    showError('notes-form', 'Failed to add note. Please try again.');
  }
}

// Edit a note
async function editNote(noteId) {
  const note = currentNotes.find(n => n.id === noteId);
  if (!note) {
    console.error('Note not found:', noteId);
    return;
  }
  
  const newText = prompt('Edit note:', note.text);
  if (newText === null) return; // User cancelled
  
  if (newText.trim() === '') {
    alert('Note cannot be empty');
    return;
  }
  
  try {
    const response = await fetch(`/api/firebase-api/notes/${noteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: newText
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update note: ${response.status}`);
    }
    
    // Refresh notes
    await fetchNotes(currentAccountNumber);
    
    // Show success message
    showMessage('Note updated successfully');
  } catch (error) {
    console.error('Error updating note:', error);
    showError('notes-list', 'Failed to update note. Please try again.');
  }
}

// Delete a note
async function deleteNote(noteId) {
  if (!confirm('Are you sure you want to delete this note?')) return;
  
  try {
    const response = await fetch(`/api/firebase-api/notes/${noteId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete note: ${response.status}`);
    }
    
    // Refresh notes
    await fetchNotes(currentAccountNumber);
    
    // Show success message
    showMessage('Note deleted successfully');
  } catch (error) {
    console.error('Error deleting note:', error);
    showError('notes-list', 'Failed to delete note. Please try again.');
  }
}

// ------------------------
// Reminders Functions
// ------------------------

// Fetch reminders for an account
async function fetchReminders(accountNumber) {
  try {
    toggleLoading('reminders-list', true);
    
    const response = await fetch(`/api/firebase-api/reminders/${accountNumber}`);
    if (!response.ok) {
      throw new Error(`Error fetching reminders: ${response.status}`);
    }
    
    const data = await response.json();
    currentReminders = data.reminders || [];
    
    displayReminders();
  } catch (error) {
    console.error('Error fetching reminders:', error);
    showError('reminders-list', 'Failed to load reminders. Please try again.');
  } finally {
    toggleLoading('reminders-list', false);
  }
}

// Display reminders
function displayReminders() {
  const remindersList = document.getElementById('reminders-list');
  
  if (!remindersList) {
    console.error('Reminders list element not found');
    return;
  }
  
  // Clear previous content
  remindersList.innerHTML = '';
  
  if (currentReminders.length === 0) {
    remindersList.innerHTML = `
      <div class="empty-state">
        <p>No reminders found for this account.</p>
        <p>Add a reminder using the form below.</p>
      </div>
    `;
    return;
  }
  
  // Sort reminders - first incomplete by due date, then completed
  currentReminders.sort((a, b) => {
    // Completed reminders go last
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    
    // Otherwise sort by due date
    return new Date(a.dueDate) - new Date(b.dueDate);
  });
  
  // Create reminder cards
  currentReminders.forEach(reminder => {
    const status = getReminderStatus(reminder.dueDate, reminder.completed);
    const statusClass = `status-${status}`;
    let statusLabel = '';
    
    switch(status) {
      case 'completed':
        statusLabel = 'Completed';
        break;
      case 'overdue':
        statusLabel = 'Overdue';
        break;
      case 'due-today':
        statusLabel = 'Due Today';
        break;
      default:
        statusLabel = 'Pending';
    }
    
    const relativeTime = getRelativeTimeString(reminder.dueDate);
    
    const reminderCard = document.createElement('div');
    reminderCard.className = `item-card reminder-card ${reminder.completed ? 'completed' : ''}`;
    reminderCard.dataset.id = reminder.id;
    
    reminderCard.innerHTML = `
      <div class="item-header">
        <div>
          <span class="reminder-status ${statusClass}">${statusLabel}</span>
          <span class="item-date">Due: ${formatDate(reminder.dueDate)} (${relativeTime})</span>
        </div>
        <div class="item-actions">
          ${!reminder.completed ? `<button class="item-action-btn complete" title="Mark as Complete">✅</button>` : ''}
          <button class="item-action-btn edit" title="Edit Reminder">✏️</button>
          <button class="item-action-btn delete" title="Delete Reminder">🗑️</button>
        </div>
      </div>
      <div class="item-content">${reminder.text}</div>
      ${reminder.recurring ? `<div class="item-footer"><small>Recurring: ${reminder.recurring}</small></div>` : ''}
    `;
    
    // Add event listeners
    if (!reminder.completed) {
      reminderCard.querySelector('.complete').addEventListener('click', () => completeReminder(reminder.id));
    }
    reminderCard.querySelector('.edit').addEventListener('click', () => editReminder(reminder.id));
    reminderCard.querySelector('.delete').addEventListener('click', () => deleteReminder(reminder.id));
    
    remindersList.appendChild(reminderCard);
  });
}

// Add a new reminder
async function addReminder(event) {
  event.preventDefault();
  
  const textArea = document.getElementById('reminder-text');
  const dueDateInput = document.getElementById('reminder-due-date');
  const recurringSelect = document.getElementById('reminder-recurring');
  
  const text = textArea.value.trim();
  const dueDate = dueDateInput.value;
  const recurring = recurringSelect.value;
  
  if (!text) {
    alert('Please enter a reminder description');
    return;
  }
  
  if (!dueDate) {
    alert('Please select a due date');
    return;
  }
  
  if (!currentAccountNumber) {
    alert('No account associated with this invoice');
    return;
  }
  
  try {
    const response = await fetch('/api/firebase-api/reminders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountNumber: currentAccountNumber,
        invoiceId: currentInvoiceId,
        text,
        dueDate,
        recurring: recurring === 'none' ? null : recurring
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add reminder: ${response.status}`);
    }
    
    // Clear the form
    textArea.value = '';
    dueDateInput.value = '';
    recurringSelect.value = 'none';
    
    // Refresh reminders
    await fetchReminders(currentAccountNumber);
    
    // Show success message
    showMessage('Reminder added successfully');
  } catch (error) {
    console.error('Error adding reminder:', error);
    showError('reminders-form', 'Failed to add reminder. Please try again.');
  }
}

// Edit a reminder
async function editReminder(reminderId) {
  const reminder = currentReminders.find(r => r.id === reminderId);
  if (!reminder) {
    console.error('Reminder not found:', reminderId);
    return;
  }
  
  const newText = prompt('Edit reminder description:', reminder.text);
  if (newText === null) return; // User cancelled
  
  if (newText.trim() === '') {
    alert('Reminder description cannot be empty');
    return;
  }
  
  try {
    const response = await fetch(`/api/firebase-api/reminders/${reminderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: newText
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update reminder: ${response.status}`);
    }
    
    // Refresh reminders
    await fetchReminders(currentAccountNumber);
    
    // Show success message
    showMessage('Reminder updated successfully');
  } catch (error) {
    console.error('Error updating reminder:', error);
    showError('reminders-list', 'Failed to update reminder. Please try again.');
  }
}

// Complete a reminder
async function completeReminder(reminderId) {
  try {
    const response = await fetch(`/api/firebase-api/reminders/${reminderId}/complete`, {
      method: 'PUT'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to complete reminder: ${response.status}`);
    }
    
    // Refresh reminders
    await fetchReminders(currentAccountNumber);
    
    // Show success message
    showMessage('Reminder marked as complete');
  } catch (error) {
    console.error('Error completing reminder:', error);
    showError('reminders-list', 'Failed to complete reminder. Please try again.');
  }
}

// Delete a reminder
async function deleteReminder(reminderId) {
  if (!confirm('Are you sure you want to delete this reminder?')) return;
  
  try {
    const response = await fetch(`/api/firebase-api/reminders/${reminderId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete reminder: ${response.status}`);
    }
    
    // Refresh reminders
    await fetchReminders(currentAccountNumber);
    
    // Show success message
    showMessage('Reminder deleted successfully');
  } catch (error) {
    console.error('Error deleting reminder:', error);
    showError('reminders-list', 'Failed to delete reminder. Please try again.');
  }
}

// ------------------------
// Helper Functions
// ------------------------

// Toggle loading indicator
function toggleLoading(containerId, show) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Remove existing loading indicator if any
  const existingIndicator = container.querySelector('.loading-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  // Add new loading indicator if show is true
  if (show) {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div class="spinner"></div>
      <p>Loading...</p>
    `;
    
    container.prepend(loadingIndicator);
  }
}

// Show error message in a container
function showError(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Remove existing error message if any
  const existingError = container.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }
  
  // Add new error message
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.textContent = message;
  
  container.prepend(errorElement);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (errorElement.parentNode === container) {
      errorElement.remove();
    }
  }, 5000);
}

// Show success message (using existing showMessage function if available)
function showMessage(message, type = 'success') {
  // Check if there's already a showMessage function defined in the parent app
  if (typeof window.showMessage === 'function') {
    window.showMessage(message, type);
    return;
  }
  
  // Fallback to alert if no showMessage function exists
  alert(message);
}

// ------------------------
// Integration Functions
// ------------------------

// Initialize notes and reminders for an invoice
function initNotesAndReminders(invoice) {
  // Set current invoice and account
  currentInvoiceId = invoice.InvoiceID;
  
  // Extract account number from invoice
  // This assumes account number is in the Contact.AccountNumber field
  // Adjust based on your Xero account structure
  currentAccountNumber = invoice.Contact?.AccountNumber;
  
  // If no account number, try to use ContactID instead
  if (!currentAccountNumber && invoice.Contact?.ContactID) {
    currentAccountNumber = invoice.Contact.ContactID;
  }
  
  // If still no account number, use invoice ID as fallback
  if (!currentAccountNumber) {
    currentAccountNumber = invoice.InvoiceID;
  }
  
  console.log(`Initializing notes and reminders for account: ${currentAccountNumber}`);
  
  // Fetch notes and reminders
  fetchNotes(currentAccountNumber);
  fetchReminders(currentAccountNumber);
  
  // Initialize tabs
  initTabs();
  
  // Set up form submission handlers
  const noteForm = document.getElementById('add-note-form');
  if (noteForm) {
    noteForm.addEventListener('submit', addNote);
  }
  
  const reminderForm = document.getElementById('add-reminder-form');
  if (reminderForm) {
    reminderForm.addEventListener('submit', addReminder);
  }
  
  // Pre-fill the due date field with tomorrow's date
  const dueDateInput = document.getElementById('reminder-due-date');
  if (dueDateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDateInput.value = tomorrow.toISOString().split('T')[0];
  }
}

// Export functions for use in the main application
window.notesAndReminders = {
  init: initNotesAndReminders,
  fetchNotes,
  fetchReminders,
  addNote,
  addReminder
};