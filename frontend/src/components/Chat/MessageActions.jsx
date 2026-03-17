import React, { useEffect, useRef } from 'react';
import { 
  FaReply, FaShare, FaCopy, FaBookmark, FaEdit, 
  FaTrash, FaThumbtack, FaBan, FaExclamationCircle,
  FaCheck, FaTimes, FaRegBookmark, FaRegTrashAlt
} from 'react-icons/fa';
import { useSelector } from 'react-redux';

const MessageActions = ({ 
  message, 
  isOwn, 
  position = 'top',
  onClose,
  onReply,
  onForward,
  onCopy,
  onSave,
  onEdit,
  onDelete,
  onPin,
  onReport,
  isSaved = false,
  isPinned = false,
  showReport = false
}) => {
  const menuRef = useRef(null);
  const { user } = useSelector(state => state.auth);

  // Закрытие при клике вне меню
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Определяем позицию меню
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full mb-2';
      case 'bottom':
        return 'top-full mt-2';
      case 'left':
        return 'right-full mr-2';
      case 'right':
        return 'left-full ml-2';
      default:
        return 'bottom-full mb-2';
    }
  };

  return (
    <div
      ref={menuRef}
      className={`absolute ${getPositionClasses()} z-50 bg-white rounded-lg shadow-xl min-w-[220px] py-1 border border-gray-200`}
      style={{ 
        [position === 'top' || position === 'bottom' ? 'left' : 'top']: '50%',
        transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : 'translateY(-50%)'
      }}
    >
      {/* Ответить */}
      <button
        onClick={() => {
          onReply?.(message);
          onClose();
        }}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 transition group"
      >
        <div className="w-6 text-gray-500 group-hover:text-blue-500">
          <FaReply className="text-sm" />
        </div>
        <span className="flex-1 text-sm">Ответить</span>
        <span className="text-xs text-gray-400">Ctrl+R</span>
      </button>

      {/* Переслать */}
      <button
        onClick={() => {
          onForward?.(message);
          onClose();
        }}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 transition group"
      >
        <div className="w-6 text-gray-500 group-hover:text-blue-500">
          <FaShare className="text-sm" />
        </div>
        <span className="flex-1 text-sm">Переслать</span>
        <span className="text-xs text-gray-400">Ctrl+F</span>
      </button>

      {/* Копировать (только для текста) */}
      {message.message_type === 'text' && message.content && (
        <button
          onClick={() => {
            onCopy?.(message);
            onClose();
          }}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 transition group"
        >
          <div className="w-6 text-gray-500 group-hover:text-blue-500">
            <FaCopy className="text-sm" />
          </div>
          <span className="flex-1 text-sm">Копировать</span>
          <span className="text-xs text-gray-400">Ctrl+C</span>
        </button>
      )}

      {/* Сохранить / Удалить из сохраненных */}
      <button
        onClick={() => {
          onSave?.(message);
          onClose();
        }}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 transition group"
      >
        <div className={`w-6 ${isSaved ? 'text-yellow-500' : 'text-gray-500 group-hover:text-yellow-500'}`}>
          {isSaved ? <FaBookmark /> : <FaRegBookmark />}
        </div>
        <span className="flex-1 text-sm">
          {isSaved ? 'Удалить из сохраненных' : 'Сохранить'}
        </span>
        <span className="text-xs text-gray-400">Ctrl+S</span>
      </button>

      {/* Разделитель */}
      <div className="border-t border-gray-200 my-1"></div>

      {/* Закрепить / Открепить */}
      {isOwn && (
        <button
          onClick={() => {
            onPin?.(message);
            onClose();
          }}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 transition group"
        >
          <div className={`w-6 ${isPinned ? 'text-blue-500' : 'text-gray-500 group-hover:text-blue-500'}`}>
            <FaThumbtack className={`text-sm ${isPinned ? 'rotate-45' : ''}`} />
          </div>
          <span className="flex-1 text-sm">
            {isPinned ? 'Открепить' : 'Закрепить'}
          </span>
        </button>
      )}

      {/* Редактировать (только свои текстовые сообщения) */}
      {isOwn && message.message_type === 'text' && !message.is_deleted && (
        <button
          onClick={() => {
            onEdit?.(message);
            onClose();
          }}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 transition group"
        >
          <div className="w-6 text-gray-500 group-hover:text-green-500">
            <FaEdit className="text-sm" />
          </div>
          <span className="flex-1 text-sm">Редактировать</span>
          <span className="text-xs text-gray-400">Ctrl+E</span>
        </button>
      )}

      {/* Удалить для себя */}
      <button
        onClick={() => {
          onDelete?.(message, 'me');
          onClose();
        }}
        className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 transition group"
      >
        <div className="w-6 text-gray-500 group-hover:text-red-500">
          <FaRegTrashAlt className="text-sm" />
        </div>
        <span className="flex-1 text-sm">Удалить для себя</span>
      </button>

      {/* Удалить для всех (только свои) */}
      {isOwn && !message.is_deleted && (
        <button
          onClick={() => {
            if (window.confirm('Удалить сообщение для всех?')) {
              onDelete?.(message, 'everyone');
            }
            onClose();
          }}
          className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-3 transition group"
        >
          <div className="w-6 text-gray-500 group-hover:text-red-500">
            <FaTrash className="text-sm" />
          </div>
          <span className="flex-1 text-sm text-red-600">Удалить для всех</span>
        </button>
      )}

      {/* Пожаловаться (для чужих сообщений) */}
      {showReport && !isOwn && (
        <>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            onClick={() => {
              onReport?.(message);
              onClose();
            }}
            className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center space-x-3 transition group"
          >
            <div className="w-6 text-gray-500 group-hover:text-red-500">
              <FaExclamationCircle className="text-sm" />
            </div>
            <span className="flex-1 text-sm text-red-600">Пожаловаться</span>
          </button>
        </>
      )}
    </div>
  );
};

export default MessageActions;