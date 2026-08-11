import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (!conversationId) {
      createConversation();
    }
    loadConversations();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [user, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/chat/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConversations(data || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  async function createConversation() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      setError('');
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('No auth token');
      const res = await fetch(`${API_URL}/chat/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = await res.json();
      if (data && data.id) {
        setConversationId(data.id);
        loadConversations();
      } else {
        console.error('Conversation create returned no id', data);
        setError('Failed to create conversation. Please try again.');
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError('Failed to create conversation. Check console for details.');
    } finally {
      creatingRef.current = false;
    }
  }

  async function selectConversation(id) {
    setConversationId(id);
    setSidebarOpen(false);
    if (wsRef.current) wsRef.current.close();
  }

  function connectWS() {
    if (!conversationId) {
      console.log('connectWS skipped: no conversationId');
      return;
    }

    console.log('Connecting WS for conversation:', conversationId);

    if (wsRef.current) wsRef.current.close();

    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        console.error('No session token for WebSocket');
        return;
      }

      const wsUrl = `${API_URL.replace('http://', 'ws://')}/ws/chat/${conversationId}`;
      console.log('WebSocket URL:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WS open, sending token');
        ws.send(JSON.stringify({ token }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'history') {
            console.log('History:', data.messages?.length || 0);
            setMessages(data.messages || []);
          } else if (data.type === 'chunk') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + data.content };
              } else {
                next.push({ role: 'assistant', content: data.content });
              }
              return next;
            });
          } else if (data.type === 'done') {
            console.log('WS done');
            setLoading(false);
          } else if (data.type === 'error') {
            console.error('WS error:', data.content);
            setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${data.content}` }]);
            setLoading(false);
          }
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WS error:', err);
      };

      ws.onclose = (event) => {
        console.log('WS closed:', event.code, event.reason);
        if (!event.wasClean) {
          setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection lost. Retrying...' }]);
          setTimeout(() => connectWS(), 1000);
        }
      };
    });
  }

  useEffect(() => {
    if (conversationId) connectWS();
  }, [conversationId]);

  const sendMessage = async () => {
    console.log('sendMessage called', { input, loading, conversationId });
    if (!input.trim() || loading || !conversationId) {
      console.log('sendMessage blocked');
      return;
    }

    const content = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setLoading(true);

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'message', content }));
        console.log('Message sent via WS');
      } else {
        console.log('WS not ready, falling back to HTTP');
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) throw new Error('No auth token');
        const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        const data = await res.json();
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setLoading(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Failed: ${err.message}` }]);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      {sidebarOpen && <div style={styles.overlay} onClick={() => setSidebarOpen(false)} />}
      <aside style={{...styles.sidebar, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'}}>
        <div style={styles.sidebarHeader}>
          <h3 style={styles.sidebarTitle}>Conversations</h3>
          <button onClick={createConversation} style={styles.newChatBtn}>+ New</button>
        </div>
        <div style={styles.conversationList}>
          {conversations.map((conv) => (
            <div key={conv.id} onClick={() => selectConversation(conv.id)} style={{...styles.conversationItem, background: conv.id === conversationId ? '#f0f0ff' : 'transparent'}}>
              <span style={styles.conversationTitle}>{conv.title}</span>
            </div>
          ))}
        </div>
      </aside>
      <main style={styles.main}>
        <header style={styles.header}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={styles.menuBtn}>☰</button>
          <h3 style={styles.headerTitle}>AI Chat</h3>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </header>
        <div style={styles.messagesContainer}>
          {!conversationId && (
            <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
              {error || 'Creating conversation...'}
              <br />
              <button onClick={createConversation} style={{ marginTop: 10, padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{...styles.messageWrapper, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'}}>
              <div style={{
                ...styles.bubble,
                background: msg.role === 'user' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f0f0f0',
                color: msg.role === 'user' ? 'white' : '#1a1a2e'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && <div style={styles.typing}>AI is typing...</div>}
          <div ref={bottomRef} />
        </div>
        <div style={styles.inputArea}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={conversationId ? "Type a message..." : "Waiting for conversation..."}
            disabled={!conversationId || loading}
            style={styles.textInput}
          />
          <button 
            onClick={sendMessage} 
            disabled={loading || !input.trim() || !conversationId} 
            style={{...styles.sendBtn, opacity: (loading || !input.trim() || !conversationId) ? 0.5 : 1}}
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', background: '#f5f6fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10 },
  sidebar: { position: 'fixed', left: 0, top: 0, bottom: 0, width: 280, background: 'white', boxShadow: '2px 0 10px rgba(0,0,0,0.1)', zIndex: 20, transition: 'transform 0.3s ease', display: 'flex', flexDirection: 'column' },
  sidebarHeader: { padding: 20, borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sidebarTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' },
  newChatBtn: { padding: '6px 12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  conversationList: { flex: 1, overflowY: 'auto', padding: '10px 0' },
  conversationItem: { padding: '12px 20px', cursor: 'pointer', transition: 'background 0.2s' },
  conversationTitle: { fontSize: 14, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 0 },
  header: { padding: '15px 20px', background: 'white', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 15 },
  menuBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#667eea', padding: 4 },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a2e' },
  logoutBtn: { marginLeft: 'auto', padding: '8px 16px', background: '#f0f0f0', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#666' },
  messagesContainer: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  messageWrapper: { display: 'flex', width: '100%' },
  bubble: { padding: '12px 16px', borderRadius: 18, maxWidth: '70%', fontSize: 15, lineHeight: 1.5, wordWrap: 'break-word', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  typing: { color: '#999', fontSize: 13, fontStyle: 'italic', padding: '0 20px' },
  inputArea: { padding: 15, background: 'white', borderTop: '1px solid #e0e0e0', display: 'flex', gap: 10 },
  textInput: { flex: 1, padding: '12px 16px', border: '1px solid #e0e0e0', borderRadius: 24, fontSize: 15, outline: 'none', transition: 'border-color 0.2s' },
  sendBtn: { padding: '12px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'transform 0.1s' }
};
