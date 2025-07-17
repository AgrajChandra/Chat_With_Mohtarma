/**
 * Chat Application Client
 * Handles WebSocket connections and real-time messaging
 */

class ChatClient {
  constructor() {
    this.socket = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.username = null
    this.selectedUser = null
    this.userList = []
    this.unreadCounts = {} // { username: count }
    this.chatHistory = {} // { username: [messages] }

    // DOM elements
    this.elements = {
      messages: document.getElementById("messages"),
      messageInput: document.getElementById("messageInput"),
      sendButton: document.getElementById("sendButton"),
      connectionStatus: document.getElementById("connectionStatus"),
      statusIndicator: document.getElementById("statusIndicator"),
      statusText: document.getElementById("statusText"),
      loadingOverlay: document.getElementById("loadingOverlay"),
      userList: document.getElementById("userList"),
      userListContainer: document.getElementById("userListContainer"),
      usernameModal: document.getElementById("usernameModal"),
      usernameInput: document.getElementById("usernameInput"),
      usernameSubmit: document.getElementById("usernameSubmit"),
      usernameError: document.getElementById("usernameError"),
      selectedUserDisplay: document.getElementById("selectedUserDisplay"),
      toggleUserListFloating: document.getElementById("toggleUserListFloating"),
      toggleUserList: document.getElementById("toggleUserList"),
    }

    this.init()
  }

  /**
   * Initialize the chat client
   */
  init() {
    this.showUsernameModal()
    this.setupEventListeners()
    this.setupUserListToggle()
  }

  showUsernameModal() {
    this.elements.usernameModal.style.display = "flex"
    this.elements.usernameInput.focus()
    this.elements.usernameSubmit.disabled = false
    this.elements.usernameError.style.display = "none"
    this.elements.usernameSubmit.onclick = () => this.submitUsername()
    this.elements.usernameInput.onkeypress = (e) => {
      if (e.key === "Enter") this.submitUsername()
    }
    this.elements.usernameInput.oninput = () => {
      this.elements.usernameError.style.display = "none"
      this.elements.usernameSubmit.disabled = false
    }
  }

  submitUsername() {
    const username = this.elements.usernameInput.value.trim()
    if (!username) {
      this.showUsernameError("Username required")
      return
    }
    this.username = username
    this.elements.usernameSubmit.disabled = true
    // Only connect if not already connected
    if (!this.socket || !this.isConnected) {
      this.connect()
    } else {
      // If already connected, send username now
      this.socket.emit("set_username", { username: this.username })
    }
  }

  showUsernameError(msg) {
    this.elements.usernameError.textContent = msg
    this.elements.usernameError.style.display = "block"
  }

  hideUsernameModal() {
    this.elements.usernameModal.style.display = "none"
  }

  /**
   * Set up DOM event listeners
   */
  setupEventListeners() {
    // Send button click
    this.elements.sendButton.addEventListener("click", () => {
      this.sendMessage()
    })

    // Enter key press in input field
    this.elements.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.sendMessage()
      }
    })

    // Input validation and button state
    this.elements.messageInput.addEventListener("input", () => {
      this.updateSendButtonState()
    })

    // Handle page visibility changes
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !this.isConnected) {
        this.connect()
      }
    })

    // Handle window focus
    window.addEventListener("focus", () => {
      if (!this.isConnected) {
        this.connect()
      }
    })

    // User selection
    this.elements.userList.addEventListener("click", (e) => {
      if (e.target.tagName === "LI" && e.target.dataset.username) {
        this.selectUser(e.target.dataset.username)
      }
    })
  }

  /**
   * Connect to the WebSocket server
   */
  connect() {
    try {
      this.updateConnectionStatus("connecting", "Connecting...")

      // Initialize Socket.IO connection
      this.socket = io("http://localhost:8080", {
        transports: ["websocket", "polling"],
        timeout: 5000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      })

      this.setupSocketListeners()
    } catch (error) {
      console.error("Connection error:", error)
      this.handleConnectionError()
    }
  }

  /**
   * Set up Socket.IO event listeners
   */
  setupSocketListeners() {
    // Connection established
    this.socket.on("connect", () => {
      console.log("Connected to server")
      this.isConnected = true
      this.reconnectAttempts = 0
      this.updateConnectionStatus("connected", "Connected")
      this.hideLoadingOverlay()
      this.updateSendButtonState()
      // Send username to server only if not already set
      if (this.username) {
        this.socket.emit("set_username", { username: this.username })
      }
    })

    // Connection lost
    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason)
      this.isConnected = false
      this.updateConnectionStatus("disconnected", "Disconnected")
      this.updateSendButtonState()

      if (reason === "io server disconnect") {
        // Server initiated disconnect, try to reconnect
        this.socket.connect()
      }
    })

    // Reconnection attempt
    this.socket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}`)
      this.updateConnectionStatus("connecting", `Reconnecting... (${attemptNumber}/${this.maxReconnectAttempts})`)
    })

    // Reconnection successful
    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`)
      this.addSystemMessage("Reconnected to chat")
    })

    // Reconnection failed
    this.socket.on("reconnect_failed", () => {
      console.log("Failed to reconnect")
      this.updateConnectionStatus("disconnected", "Connection failed")
      this.addSystemMessage("Failed to connect to chat server")
    })

    // Connection error
    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error)
      this.handleConnectionError()
    })

    // Receive message
    this.socket.on("message", (data) => {
      if (!data.private) this.displayMessage(data, "received")
    })

    // User joined
    this.socket.on("user_joined", (data) => {
      this.addSystemMessage(`${data.message}`)
    })

    // User left
    this.socket.on("user_left", (data) => {
      this.addSystemMessage(`${data.message}`)
      if (this.selectedUser === data.username) {
        this.addSystemMessage(`User ${data.username} left. Private chat ended.`)
        this.selectedUser = null
        this.renderUserList()
      }
    })

    // User list
    this.socket.on("user_list", (data) => {
      this.userList = data.users.filter(u => u !== this.username)
      this.renderUserList()
      // If selected user went offline, deselect
      if (this.selectedUser && !this.userList.includes(this.selectedUser)) {
        this.selectedUser = null
        this.addSystemMessage("Selected user went offline. Please select another user.")
        this.renderUserList()
      }
    })

    // Private message
    this.socket.on("private_message", (data) => {
      // Store message in chat history
      const otherUser = data.from === this.username ? data.to : data.from
      if (!this.chatHistory[otherUser]) this.chatHistory[otherUser] = []
      this.chatHistory[otherUser].push(data)
      // If not currently chatting with this user, increment unread count
      if (otherUser !== this.selectedUser) {
        this.unreadCounts[otherUser] = (this.unreadCounts[otherUser] || 0) + 1
        this.renderUserList()
      }
      // Only display if currently chatting with this user
      if (otherUser === this.selectedUser) {
        this.displayPrivateMessage(data)
      }
    })

    // Error
    this.socket.on("error", (data) => {
      if (data.message && data.message.includes("Username")) {
        this.showUsernameError(data.message)
        this.elements.usernameSubmit.disabled = false
      } else {
        this.addSystemMessage(data.message)
      }
    })
  }

  /**
   * Send a message to the server
   */
  sendMessage() {
    const message = this.elements.messageInput.value.trim()
    if (!message || !this.isConnected || !this.selectedUser) {
      if (!this.selectedUser) {
        this.addSystemMessage("Please select a user to chat with from the user list.")
      }
      return
    }
    // Sanitize input
    const sanitizedMessage = this.sanitizeInput(message)
    if (sanitizedMessage.length === 0) {
      return
    }
    // Private message only
    // Do NOT display or store the message here; wait for the 'private_message' event
    this.socket.emit("message", { to: this.selectedUser, text: sanitizedMessage })
    // Clear input
    this.elements.messageInput.value = ""
    this.updateSendButtonState()
    this.elements.messageInput.focus()
  }

  /**
   * Display a message in the chat
   */
  displayMessage(data, type) {
    const messageElement = document.createElement("div")
    // Align right if sent by me, left if received
    if (type === "sent") {
      messageElement.className = "message sent"
    } else {
      messageElement.className = "message received"
    }
    const bubbleElement = document.createElement("div")
    bubbleElement.className = "message-bubble"
    bubbleElement.textContent = data.username ? `${data.username}: ${data.text}` : data.text
    const timeElement = document.createElement("div")
    timeElement.className = "message-time"
    timeElement.textContent = this.formatTime(data.timestamp)
    messageElement.appendChild(bubbleElement)
    messageElement.appendChild(timeElement)
    // Remove welcome message if it exists
    const welcomeMessage = this.elements.messages.querySelector(".welcome-message")
    if (welcomeMessage) {
      welcomeMessage.remove()
    }
    this.elements.messages.appendChild(messageElement)
    this.scrollToBottom()
  }

  displayPrivateMessage(data) {
    const messageElement = document.createElement("div")
    // Align right if sent by me, left if received
    if (data.from === this.username) {
      messageElement.className = "message sent private"
    } else {
      messageElement.className = "message received private"
    }
    const bubbleElement = document.createElement("div")
    bubbleElement.className = "message-bubble"
    bubbleElement.textContent = data.text
    const timeElement = document.createElement("div")
    timeElement.className = "message-time"
    timeElement.textContent = this.formatTime(data.timestamp)
    messageElement.appendChild(bubbleElement)
    messageElement.appendChild(timeElement)
    // Remove welcome message if it exists
    const welcomeMessage = this.elements.messages.querySelector(".welcome-message")
    if (welcomeMessage) {
      welcomeMessage.remove()
    }
    this.elements.messages.appendChild(messageElement)
    this.scrollToBottom()
  }

  /**
   * Add a system message
   */
  addSystemMessage(text) {
    const messageElement = document.createElement("div")
    messageElement.className = "message system"
    messageElement.style.textAlign = "center"
    messageElement.style.color = "var(--secondary-color)"
    messageElement.style.fontStyle = "italic"
    messageElement.style.fontSize = "0.875rem"
    messageElement.textContent = text

    this.elements.messages.appendChild(messageElement)
    this.scrollToBottom()
  }

  /**
   * Update connection status display
   */
  updateConnectionStatus(status, text) {
    this.elements.statusIndicator.className = `status-indicator ${status}`
    this.elements.statusText.textContent = text
  }

  /**
   * Update send button state based on connection and input
   */
  updateSendButtonState() {
    const hasText = this.elements.messageInput.value.trim().length > 0
    this.elements.sendButton.disabled = !this.isConnected || !hasText || !this.selectedUser
  }

  /**
   * Handle connection errors
   */
  handleConnectionError() {
    this.isConnected = false
    this.updateConnectionStatus("disconnected", "Connection failed")
    this.updateSendButtonState()

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        if (!this.isConnected) {
          this.connect()
        }
      }, this.reconnectDelay * this.reconnectAttempts)
    }
  }

  /**
   * Hide loading overlay
   */
  hideLoadingOverlay() {
    this.elements.loadingOverlay.classList.add("hidden")
    this.hideUsernameModal()
  }

  /**
   * Scroll messages container to bottom
   */
  scrollToBottom() {
    this.elements.messages.scrollTop = this.elements.messages.scrollHeight
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input) {
    return input
      .replace(/[<>]/g, "") // Remove potential HTML tags
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim()
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  /**
   * Format timestamp for display
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  renderUserList() {
    this.elements.userList.innerHTML = ""
    if (this.userList.length === 0) {
      this.elements.userList.innerHTML = '<li style="color:#888;">No other users</li>'
      return
    }
    this.userList.forEach(username => {
      const li = document.createElement("li")
      li.textContent = username
      li.dataset.username = username
      if (username === this.selectedUser) li.classList.add("selected")
      // Add unread badge
      if (this.unreadCounts[username] > 0) {
        const badge = document.createElement("span")
        badge.className = "unread-badge"
        badge.textContent = this.unreadCounts[username]
        badge.style.marginLeft = "8px"
        badge.style.background = "#dc3545"
        badge.style.color = "#fff"
        badge.style.borderRadius = "10px"
        badge.style.padding = "2px 7px"
        badge.style.fontSize = "0.85em"
        li.appendChild(badge)
      }
      this.elements.userList.appendChild(li)
    })
  }

  selectUser(username) {
    this.selectedUser = username
    this.unreadCounts[username] = 0 // Reset unread count
    this.renderUserList()
    this.updateSelectedUserDisplay()
    this.updateTabTitle()
    this.showChatHistory(username)
    this.addSystemMessage(`Private chat enabled. All messages will be private to ${username}.`)
    this.updateSendButtonState()
  }

  updateSelectedUserDisplay() {
    if (this.selectedUser) {
      this.elements.selectedUserDisplay.textContent = `Chatting with: ${this.selectedUser}`
    } else {
      this.elements.selectedUserDisplay.textContent = ""
    }
  }

  updateTabTitle() {
    if (this.selectedUser) {
      document.title = `Chat with ${this.selectedUser} - Basic Chat App`
    } else {
      document.title = "Basic Chat App"
    }
  }

  showChatHistory(username) {
    this.elements.messages.innerHTML = ''
    const history = this.chatHistory[username] || []
    history.forEach(msg => {
      this.displayPrivateMessage(msg)
    })
  }

  setupUserListToggle() {
    const toggleBtn = this.elements.toggleUserList
    const floatingBtn = this.elements.toggleUserListFloating
    const userListContainer = this.elements.userListContainer
    const chatContainer = document.querySelector(".chat-container")
    if (toggleBtn && userListContainer && chatContainer && floatingBtn) {
      toggleBtn.onclick = () => {
        const isHidden = userListContainer.classList.toggle("hidden")
        chatContainer.classList.toggle("full-width", isHidden)
        toggleBtn.innerHTML = isHidden ? '&raquo;' : '&laquo;'
        toggleBtn.title = isHidden ? 'Show user list' : 'Hide user list'
        toggleBtn.setAttribute('aria-label', toggleBtn.title)
        floatingBtn.style.display = isHidden ? "block" : "none"
      }
      floatingBtn.onclick = () => {
        userListContainer.classList.remove("hidden")
        chatContainer.classList.remove("full-width")
        toggleBtn.innerHTML = '&laquo;'
        toggleBtn.title = 'Hide user list'
        toggleBtn.setAttribute('aria-label', 'Hide user list')
        floatingBtn.style.display = "none"
      }
    }
  }
}

// Initialize chat client when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new ChatClient()
})

// Handle page unload
window.addEventListener("beforeunload", () => {
  if (window.chatClient && window.chatClient.socket) {
    window.chatClient.socket.disconnect()
  }
})
