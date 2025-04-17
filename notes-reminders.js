// notes-reminders.js

console.log('Notes and reminders module loading...');

// --- Global variables ---
let currentNotes = [];
let currentReminders = [];
let currentInvoiceId = null;    // Set in initNotesAndReminders
let currentAccountNumber = null; // Set in initNotesAndReminders

// ---------------------------------
// --- Dictation Variables ---
// ---------------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let targetTextArea = null; // Keep track of which textarea to update
let dictationButtons = []; // Store references to buttons

// --- Initialize Dictation ---
if (SpeechRecognition) {
    console.log('Speech Recognition API supported.');
    recognition = new SpeechRecognition();
    recognition.continuous = false; // Process speech after pauses
    recognition.lang = 'en-US'; // Set language (adjust if needed)
    recognition.interimResults = false; // We only want final results
    recognition.maxAlternatives = 1; // Get the single best result

    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript;
        console.log('Speech result:', speechResult);
        if (targetTextArea) {
            // Append the result to the existing text, adding a space if needed
            targetTextArea.value += (targetTextArea.value.trim().length > 0 ? ' ' : '') + speechResult;
        } else {
            console.error("Dictation target text area not set!");
        }
    };

    recognition.onspeechend = () => {
        console.log('Speech ended.');
        stopDictation(); // Stop listening if speech ends
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        let errorMessage = 'Speech recognition error: ' + event.error;
        if (event.error === 'no-speech') {
            errorMessage = 'No speech detected. Please try again.';
        } else if (event.error === 'audio-capture') {
            errorMessage = 'Microphone problem. Ensure it is connected and enabled.';
        } else if (event.error === 'not-allowed') {
            errorMessage = 'Microphone access denied. Please allow access in browser settings.';
        } else if (event.error === 'service-not-allowed' || event.error === 'network') {
             errorMessage = 'Network or service error during speech recognition.';
        }
        alert(errorMessage); // Simple alert for feedback
        stopDictation(true); // Force stop without trying to stop API again if error
    };

    recognition.onend = () => {
        console.log('Speech recognition service disconnected.');
        // Ensure button style is reset even if stopped unexpectedly
         dictationButtons.forEach(button => {
             button.classList.remove('listening');
             button.title = "Start Dictation";
             const span = button.querySelector('span.visually-hidden');
             if(span) span.textContent = "Start Dictation";
         });
         targetTextArea = null; // Reset target
    };

} else {
    console.warn('Speech Recognition API not supported in this browser.');
}

// --- Dictation Control Functions ---
function startDictation(event) {
    if (!recognition) {
        alert('Sorry, voice dictation is not supported in your browser.');
        return;
    }

    const button = event.currentTarget;

    // Determine target textarea based on button ID
    if (button.id === 'start-dictation-note') {
        targetTextArea = document.getElementById('note-text');
    } else if (button.id === 'start-dictation-reminder') {
        targetTextArea = document.getElementById('reminder-text');
    } else {
        console.error("Could not determine target text area for dictation button:", button.id);
        return;
    }

    if (!targetTextArea) {
        console.error("Target text area element not found for button:", button.id);
        return;
    }

    // Stop any previous recognition just in case
    stopDictation(true);

    try {
        console.log('Starting dictation for:', targetTextArea.id);
        recognition.start();
        button.classList.add('listening');
        button.title = "Stop Dictation (Click again or finish speaking)";
        const span = button.querySelector('span.visually-hidden');
        if(span) span.textContent = "Stop Dictation";
        // Make clicking again stop it
        button.onclick = stopDictation;

    } catch (e) {
        // Handle cases like recognition already started
        console.error("Could not start dictation:", e);
        if (e.name === 'InvalidStateError') {
             console.log("Recognition might already be active. Attempting to stop first.");
             stopDictation(true); // Clean up state
             alert("Dictation couldn't start. Please try clicking the button again.");
        } else {
             alert("An error occurred starting dictation.");
        }
    }
}

function stopDictation(force = false) {
    if (recognition) {
        console.log('Attempting to stop dictation.');
        recognition.stop(); // recognition.onend handles the cleanup
    }
    // Reset the button click handler back to starting dictation
    dictationButtons.forEach(button => {
        button.onclick = startDictation;
    });
}


// ---------------------------------
// --- Core Notes/Reminders Logic ---
// ---------------------------------

// Initialize tabs system
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      button.classList.add('active');
      const tabId = button.getAttribute('data-tab');
      const contentEl = document.getElementById(tabId);
      if(contentEl) contentEl.classList.add('active');
      else console.error("Tab content not found for id:", tabId);
    });
  });

  // Activate the first tab by default if needed
  if (tabButtons.length > 0 && !document.querySelector('.tab-button.active')) {
      tabButtons[0].click();
  }
}

// Format date for display
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString(); // Adjust format as needed
  } catch (e) {
      return 'Invalid date';
  }
}

// Get relative time string
function getRelativeTimeString(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)); // Use round for closer approximation

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
        if (diffDays === -1) return 'Yesterday';
        if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
        return date.toLocaleDateString(); // Fallback to short date
    } catch (e) {
        return '';
    }
}

// Get reminder status
function getReminderStatus(dueDate, completed) {
  if (completed) return 'completed';
  if (!dueDate) return 'pending';

  try {
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) return 'pending';

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare date part only
    const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());

    if (dueDateOnly.getTime() < now.getTime()) return 'overdue';
    if (dueDateOnly.getTime() === now.getTime()) return 'due-today';
    return 'pending';
  } catch (e) {
    return 'pending';
  }
}

// --- Notes Functions ---
async function fetchNotes(accountNumber) {
  if (!accountNumber) {
      console.warn("fetchNotes called without accountNumber");
      showError('notes-list', 'Account number missing.');
      return;
  }
  try {
    toggleLoading('notes-list', true);
    const response = await fetch(`/api/firebase-api/notes/${accountNumber}`); // Uses GET implicitly
    if (!response.ok) {
      throw new Error(`Error fetching notes: ${response.status}`);
    }
    const data = await response.json();
    currentNotes = data.notes || [];
    displayNotes();
  } catch (error) {
    console.error('Error fetching notes:', error);
    showError('notes-list', 'Failed to load notes. Please try again.');
    currentNotes = []; // Clear notes on error
    displayNotes(); // Display empty state
  } finally {
    toggleLoading('notes-list', false);
  }
}

function displayNotes() {
  const notesList = document.getElementById('notes-list');
  if (!notesList) {
    console.error('Notes list element not found');
    return;
  }
  notesList.innerHTML = ''; // Clear previous content

  if (currentNotes.length === 0) {
    notesList.innerHTML = `<div class="empty-state"><p>No notes found for this account.</p></div>`;
    return;
  }

  // Sort notes (already sorted by API, but good practice client-side too if needed)
  // currentNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  currentNotes.forEach(note => {
    const categoryClass = note.category ? `category-${note.category.toLowerCase().replace(/\s+/g, '-')}` : 'category-general';
    const categoryLabel = note.category || 'General';
    const noteCard = document.createElement('div');
    noteCard.className = 'item-card note-card';
    noteCard.dataset.id = note.id;

    noteCard.innerHTML = `
      <div class="item-header">
        <div>
          <span class="note-category ${categoryClass}">${categoryLabel}</span>
          <span class="item-date">${formatDate(note.createdAt)}</span>
        </div>
        <div class="item-actions">
          <button class="item-action-btn edit" title="Edit Note" data-note-id="${note.id}">✏️</button>
          <button class="item-action-btn delete" title="Delete Note" data-note-id="${note.id}">🗑️</button>
        </div>
      </div>
      <div class="item-content">${escapeHtml(note.text)}</div> {/* Basic escaping */}
    `;
    notesList.appendChild(noteCard);
  });

   // Add event listeners after rendering all cards (event delegation)
  notesList.addEventListener('click', handleNoteActions);
}

function handleNoteActions(event) {
    const button = event.target.closest('.item-action-btn');
    if (!button) return;

    const noteId = button.dataset.noteId;
    if (!noteId) return;

    if (button.classList.contains('edit')) {
        editNote(noteId);
    } else if (button.classList.contains('delete')) {
        deleteNote(noteId);
    }
}


async function addNote(event) {
  event.preventDefault();
  const textArea = document.getElementById('note-text');
  const categorySelect = document.getElementById('note-category');
  if (!textArea || !categorySelect) return;

  const text = textArea.value.trim();
  const category = categorySelect.value;

  if (!text) {
    alert('Please enter a note text.');
    return;
  }
  if (!currentAccountNumber) {
    alert('Cannot add note: Account number is not set.');
    return;
  }

  // Optional: Add a loading state to the form button
  const submitButton = event.target.querySelector('button[type="submit"]');
  if(submitButton) submitButton.disabled = true;


  try {
    const response = await fetch('/api/firebase-api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountNumber: currentAccountNumber,
        invoiceId: currentInvoiceId, // Send current invoice ID if available
        text,
        category: category === 'general' ? null : category // Store null if 'general'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to add note: ${response.status} - ${errorData.error || response.statusText}`);
    }

    textArea.value = ''; // Clear form
    categorySelect.value = 'general';
    showMessage('Note added successfully', 'success'); // Show success
    await fetchNotes(currentAccountNumber); // Refresh notes list

  } catch (error) {
    console.error('Error adding note:', error);
    showError('notes-form', `Failed to add note. ${error.message}`);
  } finally {
      if(submitButton) submitButton.disabled = false; // Re-enable button
  }
}

async function editNote(noteId) {
  const note = currentNotes.find(n => n.id === noteId);
  if (!note) {
    console.error('Note not found for editing:', noteId);
    alert('Error: Note not found.');
    return;
  }

  const newText = prompt('Edit note text:', note.text);
  if (newText === null) return; // User cancelled prompt
  if (newText.trim() === note.text.trim()) return; // No change

  // Basic validation on client side
  if (newText.trim() === '') {
    alert('Note text cannot be empty.');
    return;
  }

  try {
    // You might want a loading indicator near the edited note
    const response = await fetch(`/api/firebase-api/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText.trim() }) // Only updating text here
    });

    if (!response.ok) {
         const errorData = await response.json();
        throw new Error(`Failed to update note: ${response.status} - ${errorData.error || response.statusText}`);
    }
    showMessage('Note updated successfully', 'success');
    await fetchNotes(currentAccountNumber); // Refresh list

  } catch (error) {
    console.error('Error updating note:', error);
    showError('notes-list', `Failed to update note. ${error.message}`);
  }
}

async function deleteNote(noteId) {
  if (!confirm('Are you sure you want to delete this note permanently?')) return;

  try {
    // You might want a loading indicator near the note being deleted
    const response = await fetch(`/api/firebase-api/notes/${noteId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to delete note: ${response.status} - ${errorData.error || response.statusText}`);
    }
    showMessage('Note deleted successfully', 'success');
    await fetchNotes(currentAccountNumber); // Refresh list

  } catch (error) {
    console.error('Error deleting note:', error);
    showError('notes-list', `Failed to delete note. ${error.message}`);
  }
}

// --- Reminders Functions ---
async function fetchReminders(accountNumber) {
   if (!accountNumber) {
      console.warn("fetchReminders called without accountNumber");
      showError('reminders-list', 'Account number missing.');
      return;
  }
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
     currentReminders = []; // Clear reminders on error
     displayReminders(); // Display empty state
  } finally {
    toggleLoading('reminders-list', false);
  }
}

function displayReminders() {
  const remindersList = document.getElementById('reminders-list');
   if (!remindersList) {
    console.error('Reminders list element not found');
    return;
  }
  remindersList.innerHTML = ''; // Clear

  if (currentReminders.length === 0) {
    remindersList.innerHTML = `<div class="empty-state"><p>No reminders found for this account.</p></div>`;
    return;
  }

  // Sort reminders (API should sort by due date, but we can refine sorting here)
  currentReminders.sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    if (a.completed && b.completed) return new Date(b.createdAt) - new Date(a.createdAt); // Show newer completed first
    // If both incomplete, sort by due date (earlier first)
    const dateA = a.dueDate ? new Date(a.dueDate) : new Date(9999, 0, 1); // Put null dates last
    const dateB = b.dueDate ? new Date(b.dueDate) : new Date(9999, 0, 1);
    return dateA - dateB;
  });

  currentReminders.forEach(reminder => {
    const status = getReminderStatus(reminder.dueDate, reminder.completed);
    const statusClass = `status-${status}`;
    let statusLabel = status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()); // Capitalize

    const relativeTime = getRelativeTimeString(reminder.dueDate);

    const reminderCard = document.createElement('div');
    reminderCard.className = `item-card reminder-card ${reminder.completed ? 'completed' : ''} ${statusClass}`;
    reminderCard.dataset.id = reminder.id;

    reminderCard.innerHTML = `
      <div class="item-header">
        <div>
          <span class="reminder-status ${statusClass}">${statusLabel}</span>
          <span class="item-date">Due: ${formatDate(reminder.dueDate)} ${relativeTime ? '('+relativeTime+')' : ''}</span>
        </div>
        <div class="item-actions">
          ${!reminder.completed ? `<button class="item-action-btn complete" title="Mark as Complete" data-reminder-id="${reminder.id}">✅</button>` : `<button class="item-action-btn uncomplete" title="Mark as Incomplete" data-reminder-id="${reminder.id}">↩️</button>`}
          <button class="item-action-btn edit" title="Edit Reminder" data-reminder-id="${reminder.id}">✏️</button>
          <button class="item-action-btn delete" title="Delete Reminder" data-reminder-id="${reminder.id}">🗑️</button>
        </div>
      </div>
      <div class="item-content">${escapeHtml(reminder.text)}</div>
      ${reminder.recurring ? `<div class="item-footer"><small>Recurring: ${escapeHtml(reminder.recurring)}</small></div>` : ''}
    `;
    remindersList.appendChild(reminderCard);
  });

   // Add event listeners after rendering all cards (event delegation)
  remindersList.addEventListener('click', handleReminderActions);
}

function handleReminderActions(event) {
    const button = event.target.closest('.item-action-btn');
    if (!button) return;

    const reminderId = button.dataset.reminderId;
    if (!reminderId) return;

    if (button.classList.contains('complete')) {
        completeReminder(reminderId, true);
    } else if (button.classList.contains('uncomplete')) {
         completeReminder(reminderId, false); // Add uncomplete functionality
    } else if (button.classList.contains('edit')) {
        editReminder(reminderId);
    } else if (button.classList.contains('delete')) {
        deleteReminder(reminderId);
    }
}


async function addReminder(event) {
  event.preventDefault();
  const textArea = document.getElementById('reminder-text');
  const dueDateInput = document.getElementById('reminder-due-date');
  const recurringSelect = document.getElementById('reminder-recurring');
  if (!textArea || !dueDateInput || !recurringSelect) return;

  const text = textArea.value.trim();
  const dueDate = dueDateInput.value; // Should be in 'YYYY-MM-DD' format from input type="date"
  const recurring = recurringSelect.value;

  if (!text) { alert('Please enter a reminder description.'); return; }
  if (!dueDate) { alert('Please select a due date.'); return; }
  if (!currentAccountNumber) { alert('Cannot add reminder: Account number is not set.'); return; }

  // Optional: Add a loading state to the form button
  const submitButton = event.target.querySelector('button[type="submit"]');
  if(submitButton) submitButton.disabled = true;

  try {
    const response = await fetch('/api/firebase-api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountNumber: currentAccountNumber,
        invoiceId: currentInvoiceId,
        text,
        dueDate, // Send as YYYY-MM-DD string, backend will convert
        recurring: recurring === 'none' ? null : recurring
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to add reminder: ${response.status} - ${errorData.error || response.statusText}`);
    }
    textArea.value = ''; // Clear form
    dueDateInput.value = getTomorrowDateString(); // Reset to tomorrow
    recurringSelect.value = 'none';
    showMessage('Reminder added successfully', 'success');
    await fetchReminders(currentAccountNumber); // Refresh list

  } catch (error) {
    console.error('Error adding reminder:', error);
    showError('reminders-form', `Failed to add reminder. ${error.message}`);
  } finally {
       if(submitButton) submitButton.disabled = false; // Re-enable button
  }
}

async function editReminder(reminderId) {
  const reminder = currentReminders.find(r => r.id === reminderId);
  if (!reminder) {
      alert('Error: Reminder not found.');
      return;
  }

  // --- Enhanced Editing: Use a modal or dedicated form for better UX ---
  // Simple prompt for text for now:
  const newText = prompt('Edit reminder description:', reminder.text);
  if (newText === null) return; // User cancelled prompt
  if (newText.trim() === reminder.text.trim()) return; // No change

  if (newText.trim() === '') {
      alert('Reminder description cannot be empty.');
      return;
  }

  try {
      const response = await fetch(`/api/firebase-api/reminders/${reminderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          // Only sending text update here. Add inputs for dueDate, recurring, completed if needed.
          body: JSON.stringify({ text: newText.trim() })
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to update reminder: ${response.status} - ${errorData.error || response.statusText}`);
      }
      showMessage('Reminder updated successfully', 'success');
      await fetchReminders(currentAccountNumber); // Refresh list
  } catch (error) {
      console.error('Error updating reminder:', error);
      showError('reminders-list', `Failed to update reminder. ${error.message}`);
  }
}


async function completeReminder(reminderId, isComplete) {
  const action = isComplete ? 'complete' : 'uncomplete';
  const endpoint = isComplete ? `/api/firebase-api/reminders/${reminderId}/complete` : `/api/firebase-api/reminders/${reminderId}`; // Use main update endpoint for uncompleting

  try {
    const options = {
        method: 'PUT',
        headers: isComplete ? undefined : { 'Content-Type': 'application/json' }, // Need header for PUT with body
        body: isComplete ? undefined : JSON.stringify({ completed: false }) // Send body for uncompleting
    };

    const response = await fetch(endpoint, options);

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to ${action} reminder: ${response.status} - ${errorData.error || response.statusText}`);
    }
    showMessage(`Reminder marked as ${action}`, 'success');
    await fetchReminders(currentAccountNumber); // Refresh list

  } catch (error) {
    console.error(`Error ${action} reminder:`, error);
    showError('reminders-list', `Failed to ${action} reminder. ${error.message}`);
  }
}


async function deleteReminder(reminderId) {
  if (!confirm('Are you sure you want to delete this reminder permanently?')) return;

  try {
    const response = await fetch(`/api/firebase-api/reminders/${reminderId}`, {
      method: 'DELETE'
    });
     if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to delete reminder: ${response.status} - ${errorData.error || response.statusText}`);
    }
    showMessage('Reminder deleted successfully', 'success');
    await fetchReminders(currentAccountNumber); // Refresh list

  } catch (error) {
    console.error('Error deleting reminder:', error);
    showError('reminders-list', `Failed to delete reminder. ${error.message}`);
  }
}

// ---------------------------------
// --- Helper Functions ---
// ---------------------------------

function toggleLoading(containerId, show) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const loadingClass = 'loading-active'; // Add a class to the container

  if (show) {
    container.classList.add(loadingClass);
    // Optional: Add a spinner element if not using CSS background
    if (!container.querySelector('.loading-indicator')) {
        const spinner = document.createElement('div');
        spinner.className = 'loading-indicator';
        spinner.innerHTML = '<div class="spinner"></div><p>Loading...</p>'; // Add your spinner HTML/CSS
        container.prepend(spinner);
    }
  } else {
    container.classList.remove(loadingClass);
    const existingIndicator = container.querySelector('.loading-indicator');
    if (existingIndicator) existingIndicator.remove();
  }
}

function showError(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) {
       // Fallback to alert if container not found
       console.error(`Error container #${containerId} not found. Message: ${message}`);
       alert(`Error: ${message}`);
       return;
  }

  // Remove existing error messages in this specific container
  const existingErrors = container.querySelectorAll('.error-message.transient');
  existingErrors.forEach(el => el.remove());

  const errorElement = document.createElement('div');
  errorElement.className = 'error-message transient'; // Transient class for auto-removal
  errorElement.textContent = message;
  container.prepend(errorElement); // Prepend to show at the top

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (errorElement.parentNode === container) {
      errorElement.remove();
    }
  }, 5000);
}

// Use a more robust message system if possible (e.g., toast notifications)
// This is a simplified version using a dedicated message area
function showMessage(message, type = 'success') { // type can be 'success', 'error', 'info'
    const messageArea = document.getElementById('global-message-area'); // Assume you have an element like this
    if (!messageArea) {
        console.log(`Message (${type}): ${message}`); // Fallback to console
        alert(message); // Fallback to alert
        return;
    }
    messageArea.textContent = message;
    messageArea.className = `message-area show ${type}`; // Use classes for styling

    // Auto-hide after 3-5 seconds
    setTimeout(() => {
        messageArea.classList.remove('show');
    }, type === 'error' ? 5000 : 3000);
}

function escapeHtml(unsafe) {
  // Check if input is actually a string, handle null/undefined
  if (typeof unsafe !== 'string') {
     if (unsafe === null || unsafe === undefined) return '';
     try {
          unsafe = String(unsafe); // Attempt to convert to string
     } catch (e) {
         console.error("Could not convert value to string for HTML escaping:", unsafe);
         return ''; // Return empty string if conversion fails
     }
  }
  // Perform the replacements using correct HTML entities
  return unsafe
       .replace(/&/g, "&")
       .replace(/</g, "<")
       .replace(/>/g, ">")
       .replace(/"/g, """) // <-- Corrected: Use " entity
       .replace(/'/g, "'"); // <-- Use ' entity
}

function getTomorrowDateString() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}


// ----------------------------------------------------
// --- NEW: Logic for Invoice List Status Icons ---
// ----------------------------------------------------

async function fetchFirebaseStatuses(accountNumbers) {
    // Remove duplicates and invalid entries
    const uniqueAccountNumbers = [...new Set(accountNumbers)].filter(accNum => accNum && typeof accNum === 'string' && accNum.trim() !== '');

    if (uniqueAccountNumbers.length === 0) {
        console.log("fetchFirebaseStatuses: No valid account numbers provided.");
        return {}; // No accounts to check
    }
    console.log(`Fetching Firebase status for ${uniqueAccountNumbers.length} unique accounts...`);
    try {
        const response = await fetch('/api/firebase-api/batch-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add Authorization header if your endpoint requires it
                // 'Authorization': `Bearer ${your_auth_token}`
            },
            body: JSON.stringify({ accountNumbers: uniqueAccountNumbers }) // Send the unique, valid list
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Error fetching Firebase statuses: ${response.status} ${response.statusText}`, errorBody);
            throw new Error(`HTTP error ${response.status}`);
        }

        const statusMap = await response.json();
        console.log('Received Firebase status map:', statusMap);
        return statusMap;

    } catch (error) {
        console.error('Failed to fetch Firebase statuses:', error);
        showError('invoice-summary-list', 'Could not load note/reminder status for invoices.'); // Show error in the list area
        return {}; // Return empty map on error
    }
}

// --- *** PLACEHOLDER *** ---
// Replace this with your actual function to get invoices from Xero
async function fetchXeroInvoices() {
    console.log("Fetching Xero invoices... (Placeholder)");
    // --- Make your actual API call to your Xero backend/proxy here ---
    // Example structure:
    // const response = await fetch('/api/xero-api/invoices?status=AUTHORISED&sort=Date_DESC&pageSize=100');
    // if (!response.ok) throw new Error('Failed to fetch Xero invoices');
    // const data = await response.json();
    // return data.Invoices; // Assuming the API returns { Invoices: [...] }

    // Return mock data for testing:
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    return [
        { InvoiceID: 'inv-001', InvoiceNumber: 'INV-551701', Contact: { Name: 'Client A', AccountNumber: 'ACC001' }, AmountDue: 100.00 },
        { InvoiceID: 'inv-002', InvoiceNumber: 'INV-551702', Contact: { Name: 'Client B', AccountNumber: 'ACC002' }, AmountDue: 250.50 },
        { InvoiceID: 'inv-003', InvoiceNumber: 'INV-551703', Contact: { Name: 'Client C', AccountNumber: 'ACC003' }, AmountDue: 50.00 },
        { InvoiceID: 'inv-004', InvoiceNumber: 'INV-551704', Contact: { Name: 'Client A', AccountNumber: 'ACC001' }, AmountDue: 75.00 }, // Duplicate account
        { InvoiceID: 'inv-005', InvoiceNumber: 'INV-551705', Contact: { Name: 'Client D (No Acc#)' }, AmountDue: 10.00 }, // No account number
    ];
}

// --- Orchestration Function ---
async function loadAndDisplayInvoices() {
    showInvoiceListLoading(true); // Show loading state for the list
    let firebaseStatusMap = {};

    try {
        const invoices = await fetchXeroInvoices(); // Fetch from Xero

        if (invoices && invoices.length > 0) {
            const accountNumbers = invoices
                .map(inv => inv.Contact?.AccountNumber)
                .filter(accNum => accNum); // Filter out falsy values

            if (accountNumbers.length > 0) {
                 firebaseStatusMap = await fetchFirebaseStatuses(accountNumbers); // Fetch statuses
            }
            displayInvoiceList(invoices, firebaseStatusMap); // Render the list
        } else {
            displayInvoiceList([], {}); // Display empty state
        }
    } catch (error) {
        console.error("Failed to load or display invoices:", error);
        showInvoiceListError("Could not load invoice list. Please try again.");
    } finally {
        showInvoiceListLoading(false); // Hide loading state
    }
}

// --- *** PLACEHOLDER *** ---
// Replace/Adapt this function to match your HTML structure for displaying invoices
function displayInvoiceList(invoices, firebaseStatusMap) {
    const listContainer = document.getElementById('invoice-summary-list'); // Target your list container
    if (!listContainer) {
        console.error("Invoice list container '#invoice-summary-list' not found.");
        return;
    }
    listContainer.innerHTML = ''; // Clear previous list

    if (!invoices || invoices.length === 0) {
        listContainer.innerHTML = '<p>No invoices found.</p>';
        return;
    }

    invoices.forEach(invoice => {
        const invoiceElement = document.createElement('div'); // Or 'li', 'tr', etc.
        invoiceElement.classList.add('invoice-summary-item'); // Your styling class
        invoiceElement.dataset.invoiceId = invoice.InvoiceID; // For potential click events

        const accountNum = invoice.Contact?.AccountNumber;
        // Get status, default to false if account number missing or not in map
        const status = (accountNum && firebaseStatusMap[accountNum])
                       ? firebaseStatusMap[accountNum]
                       : { hasNote: false, hasReminder: false };

        // --- Adapt this innerHTML to your desired invoice summary layout ---
        invoiceElement.innerHTML = `
            <span class="inv-details">
                <strong>${escapeHtml(invoice.InvoiceNumber || invoice.InvoiceID)}</strong>
                - ${escapeHtml(invoice.Contact?.Name || 'N/A')}
            </span>
            <span class="inv-amount">$${(invoice.AmountDue || 0).toFixed(2)}</span>
            <span class="invoice-status-icons"></span> {/* Icons will go here */}
        `;

        const iconContainer = invoiceElement.querySelector('.invoice-status-icons');
        if (iconContainer) {
            if (status.hasNote) {
                const noteIcon = document.createElement('span');
                noteIcon.textContent = '📝';
                noteIcon.title = 'Has Notes';
                noteIcon.classList.add('status-icon', 'note-icon');
                iconContainer.appendChild(noteIcon);
            }
            if (status.hasReminder) {
                const reminderIcon = document.createElement('span');
                reminderIcon.textContent = '⏰';
                reminderIcon.title = 'Has Reminders';
                reminderIcon.classList.add('status-icon', 'reminder-icon');
                iconContainer.appendChild(reminderIcon);
            }
        } else {
            console.warn("Could not find '.invoice-status-icons' container in invoice item:", invoice.InvoiceID);
        }

        listContainer.appendChild(invoiceElement);

        // Optional: Add click listener to invoice item to load details
        // invoiceElement.addEventListener('click', () => loadInvoiceDetails(invoice));
    });
}


// --- *** PLACEHOLDER *** ---
// Implement these helper functions based on your UI framework/structure
function showInvoiceListLoading(isLoading) {
    const loader = document.getElementById('invoice-list-loader');
    if (loader) loader.style.display = isLoading ? 'block' : 'none';
    console.log("Invoice List Loading:", isLoading);
}

function showInvoiceListError(message) {
     const listContainer = document.getElementById('invoice-summary-list');
     if(listContainer) {
        listContainer.innerHTML = `<p class="error-message">${escapeHtml(message)}</p>`;
     } else {
         console.error("Cannot show invoice list error, container not found.");
         alert("Error: " + message); // Fallback
     }
     console.error("Invoice List Error:", message);
}


// ---------------------------------------------
// --- Initialization and Public Interface ---
// ---------------------------------------------

// Main initialization for the notes/reminders section (called when viewing details)
function initNotesAndReminders(invoiceData) {
  if (!invoiceData || !invoiceData.InvoiceID) {
      console.error("initNotesAndReminders called with invalid invoice data.");
      // Optionally display an error in the notes/reminders container
      return;
  }
  // Set current invoice and account
  currentInvoiceId = invoiceData.InvoiceID;
  currentAccountNumber = invoiceData.Contact?.AccountNumber;

  // Handle cases where account number might be missing but needed
  if (!currentAccountNumber) {
      console.warn(`Invoice ${currentInvoiceId} does not have an AccountNumber. Notes/Reminders might be limited.`);
      // Decide how to handle this - disable the feature, show a message, or proceed?
      // For now, we proceed, but fetching might fail or show nothing if backend relies on it.
  }

  console.log(`Initializing notes/reminders for Account: ${currentAccountNumber || 'N/A'}, Invoice: ${currentInvoiceId}`);

  // Fetch notes and reminders specifically for this context
  if (currentAccountNumber) {
       fetchNotes(currentAccountNumber);
       fetchReminders(currentAccountNumber);
  } else {
       // Clear or show disabled state if no account number
       displayNotes(); // Show empty/error state
       displayReminders(); // Show empty/error state
       showError('notes-list', 'Account number is missing, cannot load notes.');
       showError('reminders-list', 'Account number is missing, cannot load reminders.');
  }


  // Initialize tabs UI
  initTabs();

  // Set up form submission handlers (ensure forms exist)
  const noteForm = document.getElementById('add-note-form');
  if (noteForm) {
    noteForm.removeEventListener('submit', addNote); // Remove previous listener if any
    noteForm.addEventListener('submit', addNote);
  } else {
      console.warn("Add note form not found.");
  }

  const reminderForm = document.getElementById('add-reminder-form');
  if (reminderForm) {
    reminderForm.removeEventListener('submit', addReminder); // Remove previous listener if any
    reminderForm.addEventListener('submit', addReminder);
  } else {
       console.warn("Add reminder form not found.");
  }


  // Set up dictation buttons if API is supported
  if (SpeechRecognition) {
    dictationButtons = []; // Clear previous button references
    const noteDictationButton = document.getElementById('start-dictation-note');
    const reminderDictationButton = document.getElementById('start-dictation-reminder');

    if (noteDictationButton) {
        noteDictationButton.onclick = startDictation; // Reset handler
        dictationButtons.push(noteDictationButton);
    }
    if (reminderDictationButton) {
        reminderDictationButton.onclick = startDictation; // Reset handler
        dictationButtons.push(reminderDictationButton);
    }
  } else {
      // Hide buttons if API not supported (can be done here or via CSS)
      document.querySelectorAll('.dictation-button').forEach(btn => btn.style.display = 'none');
  }

  // Pre-fill the reminder due date field with tomorrow's date
  const dueDateInput = document.getElementById('reminder-due-date');
  if (dueDateInput) {
    dueDateInput.value = getTomorrowDateString();
    dueDateInput.min = new Date().toISOString().split('T')[0]; // Prevent past dates?
  }
}

// --- Expose necessary functions globally ---
// Make the main initialization function and potentially the list loading function available
window.notesAndReminders = {
  init: initNotesAndReminders,        // Call this when loading invoice details
  loadInvoiceList: loadAndDisplayInvoices // Call this to load the main summary list
  // Add other functions here IF they need to be called directly from outside this module
};

// Example: Trigger invoice list load when the DOM is ready (adjust trigger as needed)
// document.addEventListener('DOMContentLoaded', () => {
//     // Check if user is logged in first etc.
//     if (isUserLoggedIn()) { // Replace with your actual auth check
//         window.notesAndReminders.loadInvoiceList();
//     }
// });


console.log('Notes and reminders module fully loaded.');