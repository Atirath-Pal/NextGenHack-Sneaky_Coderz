import React, { useState } from 'react';
import { API_BASE } from '../config/api';

const Login = () => {
  const [view, setView] = useState('login');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('userId', data.userId);
        window.location.href = '/';
      } else {
        setMessage(data.message || "Login failed");
      }
    } catch {
      setMessage("An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (password !== confirmPassword) {
      setMessage("Passwords do not match!");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (data.success) {
        setMessage("Account created successfully! Please login.");
        setView('login');
      } else {
        setMessage(data.message || "Registration failed");
      }
    } catch {
      setMessage("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('Sending password reset link...');

    try {
      const response = await fetch(`${API_BASE}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      setMessage(data.success ? "Check your email for reset link!" : "Failed to send reset link.");
    } catch {
      setMessage("An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-4">

      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8 transition-all">

        <h1 className="text-2xl font-bold text-center text-blue-400 mb-6">
          {view === 'login' && "Welcome Back"}
          {view === 'register' && "Create Account"}
          {view === 'forgot' && "Reset Password"}
        </h1>

        {message && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-gray-800 border border-blue-700 text-blue-300">
            {message}
          </div>
        )}

        {/* LOGIN */}
        {view === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 animate-fadeIn">

            <input
              type="text"
              placeholder="Username"
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 p-3 rounded-xl font-bold transition-all"
            >
              {loading ? "Logging in..." : "Login"}
            </button>

            <div className="text-center space-y-2 text-sm text-gray-400">
              <button type="button" onClick={() => { setView('forgot'); setMessage(''); }}
                className="text-blue-400 hover:text-blue-300">
                Forgot password?
              </button>

              <p>
                New user?
                <button type="button"
                  onClick={() => { setView('register'); setMessage(''); }}
                  className="ml-1 text-blue-400 hover:text-blue-300 font-semibold">
                  Register
                </button>
              </p>
            </div>
          </form>
        )}

        {/* REGISTER */}
        {view === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">

            <input type="text" placeholder="Username"
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl"
              value={username} onChange={(e) => setUsername(e.target.value)} required />

            <input type="email" placeholder="Email"
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl"
              value={email} onChange={(e) => setEmail(e.target.value)} required />

            <input type="password" placeholder="Password"
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl"
              value={password} onChange={(e) => setPassword(e.target.value)} required />

            <input type="password" placeholder="Confirm Password"
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required />

            <button type="submit"
              className="w-full bg-green-600 hover:bg-green-500 p-3 rounded-xl font-bold">
              {loading ? "Creating..." : "Create Account"}
            </button>

            <button type="button"
              onClick={() => { setView('login'); setMessage(''); }}
              className="text-sm text-gray-400 w-full mt-2">
              ← Back to Login
            </button>
          </form>
        )}

        {/* FORGOT */}
        {view === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="space-y-4">

            <p className="text-sm text-gray-400 text-center">
              Enter email to receive reset link
            </p>

            <input
              type="email"
              placeholder="Email address"
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <button type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 p-3 rounded-xl font-bold">
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <button type="button"
              onClick={() => { setView('login'); setMessage(''); }}
              className="text-sm text-gray-400 w-full">
              ← Back to Login
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default Login;