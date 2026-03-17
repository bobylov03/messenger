import React, { useState, useRef, useEffect } from 'react';
import { 
  FaPaperPlane, FaImage, FaVideo, FaMicrophone, FaFile, 
  FaSmile, FaPaperclip, FaTimes, FaEdit, FaReply, 
  FaTrash, FaStop, FaPlay, FaPause, FaRegStopCircle
} from 'react-icons/fa';
import { useDropzone } from 'react-dropzone';
import EmojiPicker from 'emoji-picker-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import WaveSurfer from 'wavesurfer.js';

const MessageInput = ({ 
  onSendMessage, 
  onTyping, 
  disabled,
  replyToMessage,
  editMessage,
  onCancelReply,
  onCancelEdit,
  onDeleteDraft,
  draftMessage
}) => {
  // Основные состояния
  const [message, setMessage] = useState(draftMessage?.content || '');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Refs
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const wavesurferRef = useRef(null);
  const fileInputRef = useRef(null);

  // Drag & drop
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg'],
      'application/*': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.txt']
    },
    onDrop: async (acceptedFiles) => {
      for (const file of acceptedFiles) {
        await handleFileUpload(file);
      }
    },
    multiple: true,
    maxSize: 50 * 1024 * 1024 // 50MB
  });

  // Авто-высота textarea
  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  // Таймер записи
  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
    }

    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording, isPaused]);

  // Инициализация WaveSurfer для визуализации аудио
  useEffect(() => {
    if (isRecording && !wavesurferRef.current) {
      const wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#3b82f6',
        progressColor: '#1e3a8a',
        cursorColor: 'transparent',
        height: 40,
        barWidth: 2,
        barGap: 1,
        responsive: true
      });
      wavesurferRef.current = wavesurfer;
    }

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [isRecording]);

  // Анализатор громкости
  const setupAudioAnalyzer = (stream) => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();
    sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
    sourceRef.current.connect(analyserRef.current);
    analyserRef.current.fftSize = 256;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const updateLevel = () => {
      if (!isRecording) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 128); // Нормализация от 0 до 1
      requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessage(value);
    
    // Сохраняем черновик
    if (value.trim()) {
      localStorage.setItem('message_draft', JSON.stringify({
        content: value,
        timestamp: Date.now()
      }));
    } else {
      localStorage.removeItem('message_draft');
    }
    
    // Отправляем событие набора текста
    if (onTyping && !disabled) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      onTyping(true);
      
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 1000);
    }
  };

  const handleSend = () => {
    if (disabled) return;

    if (editMessage) {
      // Режим редактирования
      if (message.trim() && message !== editMessage.content) {
        onSendMessage(message, 'text', null, true);
      } else {
        onCancelEdit?.();
      }
    } else if (replyToMessage) {
      // Режим ответа
      if (message.trim() || uploading) {
        onSendMessage(message, 'text', null, false, replyToMessage.id);
      }
    } else {
      // Обычное сообщение
      if (message.trim()) {
        onSendMessage(message, 'text');
      }
    }
    
    setMessage('');
    setShowEmojiPicker(false);
    localStorage.removeItem('message_draft');
    
    if (onTyping) {
      onTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiClick = (emojiData) => {
    setMessage(prev => prev + emojiData.emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleFileUpload = async (file) => {
    // Проверка размера
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Файл слишком большой (макс. 50MB)');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });
      
      const fileData = response.data;
      
      // Определяем тип сообщения на основе типа файла
      let messageType = 'file';
      if (fileData.file_type === 'image') messageType = 'image';
      if (fileData.file_type === 'video') messageType = 'video';
      if (fileData.file_type === 'audio') messageType = 'audio';
      
      // Если это ответ на сообщение
      if (replyToMessage) {
        onSendMessage(fileData.file_name, messageType, fileData.file_url, false, replyToMessage.id);
      } else {
        onSendMessage(fileData.file_name, messageType, fileData.file_url);
      }
      
      toast.success('Файл успешно загружен');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Ошибка при загрузке файла');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Запись голосовых сообщений
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunksRef.current = [];
      setRecordingTime(0);
      setIsRecording(true);
      
      // Настройка анализатора громкости
      setupAudioAnalyzer(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Создаем файл из Blob
        const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, {
          type: 'audio/webm'
        });
        
        // Добавляем метаданные
        Object.defineProperty(audioFile, 'duration', {
          value: recordingTime
        });
        
        await handleFileUpload(audioFile);
        
        // Останавливаем все треки
        stream.getTracks().forEach(track => track.stop());
        
        // Закрываем аудио контекст
        if (audioContextRef.current) {
          await audioContextRef.current.close();
        }
        
        setRecordingTime(0);
        setAudioLevel(0);
      };
      
      mediaRecorderRef.current.start(100); // Собираем данные каждые 100ms
      
    } catch (error) {
      console.error('Recording error:', error);
      toast.error('Ошибка доступа к микрофону');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioLevel(0);
      toast('Запись отменена');
    }
  };

  // Форматирование времени записи
  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Рендер индикатора громкости
  const renderVolumeIndicator = () => {
    const bars = 20;
    const activeBars = Math.floor(audioLevel * bars);
    
    return (
      <div className="flex items-center space-x-1 ml-2">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-100 ${
              i < activeBars ? 'bg-blue-500' : 'bg-gray-300'
            }`}
            style={{
              height: `${8 + (i % 5) * 2}px`
            }}
          />
        ))}
      </div>
    );
  };

  // Рендер панели записи
  const renderRecordingPanel = () => (
    <div className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
      <button
        onClick={cancelRecording}
        className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition"
        title="Отменить"
      >
        <FaTimes />
      </button>
      
      {isPaused ? (
        <button
          onClick={resumeRecording}
          className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition"
          title="Продолжить"
        >
          <FaPlay />
        </button>
      ) : (
        <button
          onClick={pauseRecording}
          className="p-3 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition"
          title="Пауза"
        >
          <FaPause />
        </button>
      )}
      
      <button
        onClick={stopRecording}
        className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
        title="Остановить"
      >
        <FaStop />
      </button>
      
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="font-mono text-red-600">
          {formatRecordingTime(recordingTime)}
        </span>
      </div>
      
      {renderVolumeIndicator()}
      
      <div id="waveform" className="flex-1" />
    </div>
  );

  // Рендер панели ответа
  const renderReplyPanel = () => {
    if (!replyToMessage) return null;
    
    return (
      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-t-lg border-l-4 border-blue-500">
        <div className="flex items-center space-x-3">
          <FaReply className="text-blue-500" />
          <div>
            <span className="text-sm font-medium text-blue-700">
              Ответ {replyToMessage.sender_id === 'me' ? 'себе' : replyToMessage.sender_name}:
            </span>
            <p className="text-sm text-gray-600 truncate max-w-md">
              {replyToMessage.content || '[Медиа]'}
            </p>
          </div>
        </div>
        <button
          onClick={onCancelReply}
          className="p-1 hover:bg-blue-100 rounded-full transition"
        >
          <FaTimes className="text-gray-500" />
        </button>
      </div>
    );
  };

  // Рендер панели редактирования
  const renderEditPanel = () => {
    if (!editMessage) return null;
    
    return (
      <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-t-lg border-l-4 border-yellow-500">
        <div className="flex items-center space-x-3">
          <FaEdit className="text-yellow-500" />
          <div>
            <span className="text-sm font-medium text-yellow-700">
              Редактирование:
            </span>
            <p className="text-sm text-gray-600 truncate max-w-md">
              {editMessage.content || '[Медиа]'}
            </p>
          </div>
        </div>
        <button
          onClick={onCancelEdit}
          className="p-1 hover:bg-yellow-100 rounded-full transition"
        >
          <FaTimes className="text-gray-500" />
        </button>
      </div>
    );
  };

  // Рендер индикатора загрузки
  const renderUploadProgress = () => {
    if (!uploading) return null;
    
    return (
      <div className="mt-2 p-2 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
          <span>Загрузка...</span>
          <span>{uploadProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>
    );
  };

  // Рендер панели быстрых действий
  const renderQuickActions = () => (
    <div className="flex items-center space-x-2 mb-2">
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 rounded-full transition"
        title="Прикрепить файл"
      >
        <FaPaperclip className="w-5 h-5" />
      </button>
      
      <button
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        className="p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 rounded-full transition"
        title="Эмодзи"
      >
        <FaSmile className="w-5 h-5" />
      </button>
      
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 rounded-full transition"
        title="Изображение"
      >
        <FaImage className="w-5 h-5" />
      </button>
      
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 rounded-full transition"
        title="Видео"
      >
        <FaVideo className="w-5 h-5" />
      </button>
      
      {isRecording ? (
        <button
          onClick={stopRecording}
          className="p-2 text-red-500 hover:bg-red-50 rounded-full transition animate-pulse"
          title="Остановить запись"
        >
          <FaRegStopCircle className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={startRecording}
          className="p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 rounded-full transition"
          title="Голосовое сообщение"
        >
          <FaMicrophone className="w-5 h-5" />
        </button>
      )}
      
      {draftMessage && (
        <button
          onClick={onDeleteDraft}
          className="p-2 text-gray-500 hover:text-red-500 hover:bg-gray-100 rounded-full transition"
          title="Удалить черновик"
        >
          <FaTrash className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="relative">
      {/* Drag & drop overlay */}
      {isDragActive && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-10 border-2 border-blue-500 border-dashed rounded-lg z-20 flex items-center justify-center backdrop-blur-sm">
          <p className="text-blue-600 font-medium text-lg">Отпустите файлы для загрузки</p>
        </div>
      )}
      
      <div {...getRootProps()} className="cursor-pointer">
        <input {...getInputProps()} />
      </div>
      
      {/* Панели ответа/редактирования */}
      {renderReplyPanel()}
      {renderEditPanel()}
      
      {/* Панель записи */}
      {isRecording && renderRecordingPanel()}
      
      {/* Основной инпут */}
      {!isRecording && (
        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            {/* Быстрые действия */}
            {renderQuickActions()}
            
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={
                disabled 
                  ? "Подключение..." 
                  : editMessage 
                    ? "Редактировать сообщение..." 
                    : replyToMessage 
                      ? "Ответить на сообщение..." 
                      : "Введите сообщение..."
              }
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none max-h-40"
              rows="1"
              disabled={disabled || uploading}
            />
            
            {/* Emoji picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-full mb-2 left-0 z-30">
                <div className="relative">
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    searchDisabled={false}
                    skinTonesDisabled
                    previewConfig={{ showPreview: false }}
                    width={350}
                    height={400}
                  />
                  <button
                    onClick={() => setShowEmojiPicker(false)}
                    className="absolute top-2 right-2 p-1 bg-gray-200 rounded-full hover:bg-gray-300"
                  >
                    <FaTimes className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Прогресс загрузки */}
            {renderUploadProgress()}
          </div>
          
          {/* Кнопка отправки */}
          <button
            onClick={handleSend}
            disabled={(!message.trim() && !uploading) || disabled}
            className={`p-3 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 transition ${
              editMessage
                ? 'bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-500'
                : 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={editMessage ? 'Сохранить' : 'Отправить'}
          >
            {uploading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : editMessage ? (
              <FaEdit className="w-5 h-5" />
            ) : (
              <FaPaperPlane className="w-5 h-5" />
            )}
          </button>
        </div>
      )}
      
      {/* Скрытый input для файлов */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            Array.from(e.target.files).forEach(handleFileUpload);
          }
          e.target.value = ''; // Сбрасываем для возможности повторной загрузки того же файла
        }}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
      />
      
      {/* Подсказки */}
      {!disabled && !isRecording && !message && !replyToMessage && !editMessage && (
        <div className="absolute bottom-full mb-2 left-0 text-xs text-gray-400">
          Shift + Enter для новой строки
        </div>
      )}
    </div>
  );
};

export default MessageInput;