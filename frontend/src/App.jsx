import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import MainLayout from './components/Layout/MainLayout';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import CallModal from './components/Calls/CallModal';
import { WebSocketProvider } from './hooks/useWebSocket';

function App() {
  const { token } = useSelector(state => state.auth);
  const [activeCall, setActiveCall] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);

  useEffect(() => {
    const handleIncomingCall = (event) => {
      setActiveCall(event.detail);
      setShowCallModal(true);
    };

    window.addEventListener('incoming_call', handleIncomingCall);
    return () => window.removeEventListener('incoming_call', handleIncomingCall);
  }, []);

  const handleStartCall = (chatId, callType) => {
    setActiveCall({
      call_id: `temp_${Date.now()}`,
      chat_id: chatId,
      call_type: callType,
      status: 'ringing'
    });
    setShowCallModal(true);
  };

  return (
    <WebSocketProvider>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={!token ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!token ? <Register /> : <Navigate to="/" />} />
        
        <Route path="/" element={token ? <MainLayout /> : <Navigate to="/login" />}>
          <Route index element={<ChatPage onStartCall={handleStartCall} />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>

      {showCallModal && activeCall && (
        <CallModal
          callData={activeCall}
          onClose={() => {
            setShowCallModal(false);
            setActiveCall(null);
          }}
        />
      )}
    </WebSocketProvider>
  );
}

export default App;