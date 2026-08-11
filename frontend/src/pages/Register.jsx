import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password);
      setTimeout(() => navigate('/chat'), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Create account</h2>
        <p style={styles.subtitle}>Get started with AI Chat</p>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />
          <button type="submit" disabled={loading} style={{...styles.button, opacity: loading ? 0.7 : 1}}>
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>
        <p style={styles.footerText}>
          Already have an account? <Link to="/login" style={styles.link}>Login</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20 },
  card: { background: 'white', padding: 40, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: 400 },
  title: { margin: '0 0 8px 0', fontSize: 28, fontWeight: 700, color: '#1a1a2e' },
  subtitle: { margin: '0 0 24px 0', color: '#666', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  input: { padding: '14px 16px', border: '1px solid #e0e0e0', borderRadius: 10, fontSize: 15, outline: 'none', transition: 'border-color 0.2s' },
  button: { padding: '14px 16px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'transform 0.1s' },
  error: { color: '#e74c3c', background: '#fdf2f2', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  footerText: { textAlign: 'center', marginTop: 24, color: '#666', fontSize: 14 },
  link: { color: '#667eea', textDecoration: 'none', fontWeight: 600 }
};
