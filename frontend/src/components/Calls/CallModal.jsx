import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import SimplePeer from 'simple-peer';
import { FaPhone, FaVideo, FaMicrophone, FaMicrophoneSlash, FaVideoSlash, FaTimes } from 'react-icons/fa';
import { useWebSocket } from '../../hooks/useWebSocket';

const CallModal = ({ callData, onClose }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState('ringing');
  const [peer, setPeer] = useState(null);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const { user } = useSelector(state => state.auth);
  const { sendWebRTCSignal } = useWebSocket();

  useEffect(() => {
    if (callData && user) {
      initializeCall();
    }
    
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peer) {
        peer.destroy();
      }
    };
  }, [callData]);

  const initializeCall = async () => {
    try {
      // Получаем медиапоток
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callData.call_type === 'video',
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Создаем пир соединение
      const newPeer = new SimplePeer({
        initiator: callData.initiator_id === user.id,
        trickle: true,
        stream: stream,
        config: {
          iceServers: [
            { urls: process.env.REACT_APP_STUN_SERVER || 'stun:stun.l.google.com:19302' }
          ]
        }
      });
      
      newPeer.on('signal', (data) => {
        handlePeerSignal(data);
      });
      
      newPeer.on('stream', (stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
        setCallStatus('connected');
      });
      
      newPeer.on('error', (err) => {
        console.error('Peer error:', err);
        setCallStatus('error');
      });
      
      newPeer.on('close', () => {
        setCallStatus('ended');
      });
      
      setPeer(newPeer);
      
      // Слушаем входящие сигналы
      window.addEventListener('webrtc_signal', handleIncomingSignal);
      
    } catch (error) {
      console.error('Error initializing call:', error);
      setCallStatus('error');
    }
  };

  const handlePeerSignal = (data) => {
    if (data.type === 'offer') {
      sendWebRTCSignal({
        type: 'call_offer',
        call_id: callData.call_id,
        offer: data,
        call_type: callData.call_type
      });
    } else if (data.type === 'answer') {
      sendWebRTCSignal({
        type: 'call_answer',
        call_id: callData.call_id,
        answer: data
      });
    } else if (data.candidate) {
      sendWebRTCSignal({
        type: 'ice_candidate',
        call_id: callData.call_id,
        candidate: data
      });
    }
  };

  const handleIncomingSignal = (event) => {
    const signal = event.detail;
    
    if (signal.call_id !== callData.call_id) return;
    
    if (peer) {
      if (signal.type === 'webrtc_offer') {
        peer.signal(signal.offer);
      } else if (signal.type === 'webrtc_answer') {
        peer.signal(signal.answer);
      } else if (signal.type === 'webrtc_ice_candidate') {
        peer.signal(signal.candidate);
      }
    }
  };

  const handleAcceptCall = () => {
    setCallStatus('connecting');
    // Отправляем ответ на звонок
    sendWebRTCSignal({
      type: 'call_answer',
      call_id: callData.call_id,
      answer: {}
    });
  };

  const handleRejectCall = () => {
    sendWebRTCSignal({
      type: 'call_reject',
      call_id: callData.call_id
    });
    endCall();
  };

  const endCall = () => {
    if (peer) {
      peer.destroy();
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setCallStatus('ended');
    setTimeout(onClose, 1000);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const isIncomingCall = callData.initiator_id !== user.id;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-4xl">
        {/* Заголовок */}
        <div className="bg-blue-500 text-white p-4 flex justify-between items-center">
          <div className="flex items-center">
            {callData.call_type === 'video' ? (
              <FaVideo className="w-5 h-5 mr-2" />
            ) : (
              <FaPhone className="w-5 h-5 mr-2" />
            )}
            <span className="font-medium">
              {callData.call_type === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-600 p-1 rounded-full"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>
        
        {/* Основное содержимое */}
        <div className="p-6">
          {callStatus === 'ringing' && isIncomingCall && (
            <div className="text-center py-8">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                {callData.call_type === 'video' ? (
                  <FaVideo className="w-12 h-12 text-blue-500" />
                ) : (
                  <FaPhone className="w-12 h-12 text-blue-500" />
                )}
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Входящий звонок</h3>
              <p className="text-gray-600 mb-8">Принять вызов?</p>
              
              <div className="flex justify-center space-x-4">
                <button
                  onClick={handleRejectCall}
                  className="px-6 py-3 bg-red-500 text-white rounded-full hover:bg-red-600 flex items-center"
                >
                  <FaTimes className="mr-2" />
                  Отклонить
                </button>
                <button
                  onClick={handleAcceptCall}
                  className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 flex items-center"
                >
                  <FaPhone className="mr-2" />
                  Принять
                </button>
              </div>
            </div>
          )}
          
          {callStatus === 'ringing' && !isIncomingCall && (
            <div className="text-center py-8">
              <div className="animate-pulse">
                <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaPhone className="w-12 h-12 text-blue-500" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Звонок...</h3>
              <p className="text-gray-600 mb-8">Ожидание ответа</p>
              
              <button
                onClick={endCall}
                className="px-6 py-3 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                Отменить
              </button>
            </div>
          )}
          
          {(callStatus === 'connecting' || callStatus === 'connected') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Удаленное видео */}
              <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaVideo className="w-10 h-10 text-gray-400" />
                      </div>
                      <p className="text-gray-400">Соединение...</p>
                    </div>
                  </div>
                )}
                
                <div className="absolute top-4 left-4 text-white">
                  <p className="font-medium">Удаленный пользователь</p>
                </div>
              </div>
              
              {/* Локальное видео */}
              <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
                {localStream && callData.call_type === 'video' ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaMicrophone className="w-10 h-10 text-gray-400" />
                      </div>
                      <p className="text-gray-400">Вы</p>
                    </div>
                  </div>
                )}
                
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                  <div className="flex space-x-4">
                    <button
                      onClick={toggleMute}
                      className={`p-3 rounded-full ${
                        isMuted ? 'bg-red-500' : 'bg-gray-700'
                      } text-white hover:opacity-90`}
                    >
                      {isMuted ? (
                        <FaMicrophoneSlash className="w-5 h-5" />
                      ) : (
                        <FaMicrophone className="w-5 h-5" />
                      )}
                    </button>
                    
                    {callData.call_type === 'video' && (
                      <button
                        onClick={toggleVideo}
                        className={`p-3 rounded-full ${
                          isVideoOff ? 'bg-red-500' : 'bg-gray-700'
                        } text-white hover:opacity-90`}
                      >
                        {isVideoOff ? (
                          <FaVideoSlash className="w-5 h-5" />
                        ) : (
                          <FaVideo className="w-5 h-5" />
                        )}
                      </button>
                    )}
                    
                    <button
                      onClick={endCall}
                      className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <FaPhone className="w-5 h-5 transform rotate-135" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {callStatus === 'ended' && (
            <div className="text-center py-8">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaPhone className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Звонок завершен</h3>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallModal;