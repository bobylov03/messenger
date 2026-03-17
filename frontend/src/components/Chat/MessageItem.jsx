import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useSelector, useDispatch } from 'react-redux';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { 
  FaImage, FaFile, FaPlayCircle, FaMicrophone, 
  FaCheck, FaCheckDouble, FaEdit, FaTrash, FaReply, 
  FaShare, FaCopy, FaBookmark, FaThumbtack, FaSmile,
  FaEllipsisH, FaDownload, FaExternalLinkAlt, FaRegSmile,
  FaRegHeart, FaHeart, FaRegLaugh, FaLaugh, FaRegSurprise,
  FaSurprise, FaRegSadTear, FaSadTear, FaRegAngry, FaAngry
} from 'react-icons/fa';
import { useWebSocketConnection } from '../../hooks/useWebSocket';
import { saveMessage, unsaveMessage } from '../../store/chatSlice';
import toast from 'react-hot-toast';

const MessageItem = ({ 
  message, 
  isOwn, 
  onReply, 
  onForward, 
  onEdit, 
  onDelete,
  onReact,
  showAvatar = true,
  showName = false,
  previousMessage = null,
  nextMessage = null
}) => {
  const { user } = useSelector(state => state.auth);
  const { savedMessages } = useSelector(state => state.chat);
  const dispatch = useDispatch();
  const { editMessage, deleteMessage, addReaction, removeReaction } = useWebSocketConnection();
  
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || '');
  const [isSaved, setIsSaved] = useState(false);
  const [reactionCounts, setReactionCounts] = useState({});
  const [userReaction, setUserReaction] = useState(null);
  
  const messageRef = useRef(null);
  const editInputRef = useRef(null);
  const actionsTimeoutRef = useRef(null);
  const longPressTimeoutRef = useRef(null);

  // Проверяем, сохранено ли сообщение
  useEffect(() => {
    setIsSaved(savedMessages?.some(sm => sm.message.id === message.id));
  }, [savedMessages, message.id]);

  // Инициализируем реакции
  useEffect(() => {
    if (message.reactions) {
      const counts = {};
      let userReact = null;
      
      Object.entries(message.reactions).forEach(([reaction, users]) => {
        counts[reaction] = users.length;
        if (users.some(u => u.user_id === user?.id)) {
          userReact = reaction;
        }
      });
      
      setReactionCounts(counts);
      setUserReaction(userReact);
    }
  }, [message.reactions, user?.id]);

  // Форматирование времени
  const formatTime = (dateString) => {
    return format(new Date(dateString), 'HH:mm', { locale: ru });
  };

  // Форматирование даты для разделения сообщений
  const shouldShowDate = () => {
    if (!previousMessage) return true;
    const prevDate = new Date(previousMessage.sent_at);
    const currDate = new Date(message.sent_at);
    return prevDate.toDateString() !== currDate.toDateString();
  };

  // Определяем, показывать ли аватар (группировка сообщений)
  const shouldShowAvatar = () => {
    if (!showAvatar) return false;
    if (!nextMessage) return true;
    return nextMessage.sender_id !== message.sender_id;
  };

  // Обработчики действий
  const handleReply = () => {
    onReply(message);
    setShowActions(false);
  };

  const handleForward = () => {
    onForward(message);
    setShowActions(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setShowActions(false);
    setTimeout(() => editInputRef.current?.focus(), 100);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      editMessage(message.id, editContent);
      toast.success('Сообщение отредактировано');
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleDelete = (deleteFor = 'me') => {
    if (window.confirm(`Удалить сообщение ${deleteFor === 'everyone' ? 'для всех' : 'для себя'}?`)) {
      deleteMessage(message.id, deleteFor);
      toast.success('Сообщение удалено');
    }
    setShowActions(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content || '');
    toast.success('Скопировано в буфер обмена');
    setShowActions(false);
  };

  const handleSave = () => {
    if (isSaved) {
      dispatch(unsaveMessage(message.id));
      toast.success('Удалено из сохраненных');
    } else {
      dispatch(saveMessage({ messageId: message.id }));
      toast.success('Сохранено');
    }
    setShowActions(false);
  };

  const handleReaction = (reaction) => {
    if (userReaction === reaction) {
      removeReaction(message.id, reaction);
      setUserReaction(null);
    } else {
      addReaction(message.id, reaction);
      setUserReaction(reaction);
    }
    setShowReactions(false);
  };

  // Долгое нажатие для мобильных устройств
  const handleTouchStart = () => {
    longPressTimeoutRef.current = setTimeout(() => {
      setShowActions(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
  };

  // Клик вне области для скрытия действий
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (messageRef.current && !messageRef.current.contains(event.target)) {
        setShowActions(false);
        setShowReactions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Рендер содержимого сообщения
  const renderMessageContent = () => {
    // Если сообщение удалено
    if (message.is_deleted || message.message_type === 'deleted') {
      return (
        <div className="text-gray-500 italic flex items-center">
          <FaTrash className="mr-2 text-xs" />
          Сообщение удалено
        </div>
      );
    }

    // Ответ на сообщение
    if (message.reply_to) {
      return (
        <div className="mb-2">
          <div className="text-xs opacity-75 mb-1 flex items-center">
            <FaReply className="mr-1" />
            {message.reply_to.sender_id === user?.id ? 'Вы' : message.reply_to.sender?.full_name || 'Пользователь'}
          </div>
          <div className={`pl-2 border-l-2 ${isOwn ? 'border-blue-300' : 'border-gray-300'} text-sm opacity-75 mb-2 truncate max-w-xs`}>
            {message.reply_to.message_type === 'deleted' ? '[Сообщение удалено]' : message.reply_to.content || '[Медиа]'}
          </div>
          {renderMainContent()}
        </div>
      );
    }

    // Пересланное сообщение
    if (message.forwarded_from) {
      return (
        <div className="mb-2">
          <div className="text-xs opacity-75 mb-1 flex items-center">
            <FaShare className="mr-1" />
            Переслано от {message.forwarded_from.sender?.full_name || 'Пользователя'}
          </div>
          {renderMainContent()}
        </div>
      );
    }

    return renderMainContent();
  };

  const renderMainContent = () => {
    switch (message.message_type) {
      case 'image':
        return (
          <div className="max-w-sm rounded-lg overflow-hidden">
            <img
              src={message.file_url}
              alt={message.content || 'Изображение'}
              className="w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition"
              onClick={() => window.open(message.file_url, '_blank')}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://via.placeholder.com/300x200?text=Image+Error';
              }}
            />
            {message.content && (
              <p className="mt-2 text-gray-700">{message.content}</p>
            )}
          </div>
        );
      
      case 'video':
        return (
          <div className="max-w-sm">
            <ReactPlayer
              url={message.file_url}
              width="100%"
              height="auto"
              controls
              light={message.thumbnail_url}
              onClickPreview={() => window.open(message.file_url, '_blank')}
            />
            {message.content && (
              <p className="mt-2 text-gray-700">{message.content}</p>
            )}
          </div>
        );
      
      case 'audio':
      case 'voice':
        return (
          <div className="max-w-sm">
            <ReactAudioPlayer
              src={message.file_url}
              className="custom-audio-player"
              layout="horizontal"
              showJumpControls={false}
              customProgressBarSection={[]}
              customControlsSection={['MAIN_CONTROLS', 'VOLUME_CONTROLS']}
            />
            {message.content && (
              <p className="mt-2 text-gray-700">{message.content}</p>
            )}
          </div>
        );
      
      case 'file':
        return (
          <div className="flex items-center p-3 bg-gray-100 rounded-lg max-w-sm">
            <FaFile className="w-8 h-8 text-gray-500 mr-3" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{message.file_name}</p>
              <p className="text-sm text-gray-500">
                {message.file_size ? `${(message.file_size / 1024 / 1024).toFixed(2)} MB` : 'Файл'}
              </p>
              {message.content && (
                <p className="mt-1 text-gray-700 truncate">{message.content}</p>
              )}
            </div>
            <a
              href={message.file_url}
              download
              className="ml-2 p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
              title="Скачать"
            >
              <FaDownload />
            </a>
          </div>
        );
      
      default:
        if (isEditing) {
          return (
            <div className="min-w-[200px]">
              <textarea
                ref={editInputRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end space-x-2 mt-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Сохранить
                </button>
              </div>
            </div>
          );
        }
        
        return (
          <div className="text-gray-800 whitespace-pre-wrap break-words">
            {message.content}
            {message.is_edited && (
              <span className="text-xs opacity-50 ml-2">(ред.)</span>
            )}
          </div>
        );
    }
  };

  // Рендер реакций
  const renderReactions = () => {
    const reactions = [
      { icon: '👍', name: 'like' },
      { icon: '❤️', name: 'heart' },
      { icon: '😂', name: 'laugh' },
      { icon: '😮', name: 'wow' },
      { icon: '😢', name: 'sad' },
      { icon: '😡', name: 'angry' }
    ];

    return (
      <>
        {/* Кнопка открытия палитры реакций */}
        {showActions && (
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-white rounded-full shadow-lg p-2 hover:bg-gray-100 transition z-10"
            title="Добавить реакцию"
          >
            <FaRegSmile className="text-gray-600" />
          </button>
        )}

        {/* Палитра реакций */}
        {showReactions && (
          <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-white rounded-full shadow-lg p-2 flex space-x-1 z-20">
            {reactions.map((r) => (
              <button
                key={r.name}
                onClick={() => handleReaction(r.name)}
                className={`w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-lg transition transform hover:scale-125 ${
                  userReaction === r.name ? 'bg-blue-100' : ''
                }`}
              >
                {r.icon}
              </button>
            ))}
          </div>
        )}

        {/* Отображение существующих реакций */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(reactionCounts).map(([reaction, count]) => {
              const icon = {
                like: '👍',
                heart: '❤️',
                laugh: '😂',
                wow: '😮',
                sad: '😢',
                angry: '😡'
              }[reaction] || reaction;

              return (
                <button
                  key={reaction}
                  onClick={() => handleReaction(reaction)}
                  className={`px-2 py-0.5 rounded-full text-sm flex items-center space-x-1 transition ${
                    userReaction === reaction 
                      ? 'bg-blue-100 text-blue-600' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  };

  // Меню действий
  const renderActionMenu = () => (
    <div className={`absolute ${isOwn ? 'left-0' : 'right-0'} top-0 transform -translate-y-full mb-2 bg-white rounded-lg shadow-xl z-10 min-w-[200px]`}>
      {/* Ответить */}
      <button
        onClick={handleReply}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
      >
        <FaReply className="text-gray-500" />
        <span>Ответить</span>
      </button>

      {/* Переслать */}
      <button
        onClick={handleForward}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
      >
        <FaShare className="text-gray-500" />
        <span>Переслать</span>
      </button>

      {/* Копировать (только для текста) */}
      {message.message_type === 'text' && message.content && (
        <button
          onClick={handleCopy}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
        >
          <FaCopy className="text-gray-500" />
          <span>Копировать</span>
        </button>
      )}

      {/* Сохранить/Удалить из сохраненных */}
      <button
        onClick={handleSave}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
      >
        <FaBookmark className={`text-gray-500 ${isSaved ? 'text-yellow-500' : ''}`} />
        <span>{isSaved ? 'Удалить из сохраненных' : 'Сохранить'}</span>
      </button>

      {/* Разделитель */}
      <div className="border-t border-gray-200 my-1"></div>

      {/* Редактировать (только свои) */}
      {isOwn && !message.is_deleted && message.message_type === 'text' && (
        <button
          onClick={handleEdit}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
        >
          <FaEdit className="text-gray-500" />
          <span>Редактировать</span>
        </button>
      )}

      {/* Удалить для себя */}
      <button
        onClick={() => handleDelete('me')}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
      >
        <FaTrash className="text-gray-500" />
        <span>Удалить для себя</span>
      </button>

      {/* Удалить для всех (только свои) */}
      {isOwn && !message.is_deleted && (
        <button
          onClick={() => handleDelete('everyone')}
          className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center space-x-2"
        >
          <FaTrash className="text-red-500" />
          <span>Удалить для всех</span>
        </button>
      )}
    </div>
  );

  return (
    <div
      ref={messageRef}
      className={`flex mb-2 ${isOwn ? 'justify-end' : 'justify-start'} relative group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        actionsTimeoutRef.current = setTimeout(() => {
          if (!showReactions) setShowActions(false);
        }, 300);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Аватар для чужих сообщений */}
      {!isOwn && showAvatar && shouldShowAvatar() && (
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white mr-2 self-end mb-1">
          {message.sender?.full_name?.charAt(0) || message.sender?.username?.charAt(0) || 'U'}
        </div>
      )}

      {/* Отступ для выравнивания если аватар не показывается */}
      {!isOwn && !shouldShowAvatar() && <div className="w-8 mr-2"></div>}

      <div className={`max-w-2xl relative ${isOwn ? 'order-2' : 'order-1'}`}>
        {/* Имя отправителя для групповых чатов */}
        {showName && !isOwn && (
          <div className="text-xs text-gray-600 mb-1 ml-2">
            {message.sender?.full_name || message.sender?.username}
          </div>
        )}

        {/* Меню действий */}
        {showActions && !message.is_deleted && renderActionMenu()}

        {/* Реакции */}
        {renderReactions()}

        {/* Основное сообщение */}
        <div
          className={`rounded-2xl px-4 py-2 ${
            message.is_deleted 
              ? 'bg-gray-200 text-gray-500' 
              : isOwn 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100'
          }`}
        >
          {renderMessageContent()}
          
          {/* Время и статус */}
          <div className={`text-xs mt-1 flex items-center justify-end space-x-1 ${
            isOwn ? 'text-blue-100' : 'text-gray-500'
          }`}>
            <span>{formatTime(message.sent_at)}</span>
            {isOwn && !message.is_deleted && (
              <span>
                {message.is_read ? (
                  <FaCheckDouble className="text-blue-200" />
                ) : (
                  <FaCheck className="text-blue-200" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Аватар для своих сообщений (справа) */}
      {isOwn && showAvatar && shouldShowAvatar() && (
        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white ml-2 self-end mb-1">
          {user?.full_name?.charAt(0) || user?.username?.charAt(0) || 'Я'}
        </div>
      )}
    </div>
  );
};

export default MessageItem;