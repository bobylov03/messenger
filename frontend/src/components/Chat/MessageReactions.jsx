import React, { useState, useRef, useEffect } from 'react';
import { FaSmile, FaPlus } from 'react-icons/fa';
import { useSelector } from 'react-redux';

const MessageReactions = ({ 
  message, 
  reactions = {},
  onAddReaction,
  onRemoveReaction,
  currentUserId,
  position = 'top'
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [hoveredReaction, setHoveredReaction] = useState(null);
  const pickerRef = useRef(null);
  const buttonRef = useRef(null);

  // Доступные реакции
  const availableReactions = [
    { emoji: '👍', name: 'like', label: 'Нравится' },
    { emoji: '❤️', name: 'heart', label: 'Супер' },
    { emoji: '😂', name: 'laugh', label: 'Смешно' },
    { emoji: '😮', name: 'wow', label: 'Удивительно' },
    { emoji: '😢', name: 'sad', label: 'Грустно' },
    { emoji: '😡', name: 'angry', label: 'Злюсь' },
    { emoji: '👍🏻', name: 'like_light', label: 'Нравится (светлый)' },
    { emoji: '👍🏼', name: 'like_medium_light', label: 'Нравится' },
    { emoji: '👍🏽', name: 'like_medium', label: 'Нравится' },
    { emoji: '👍🏾', name: 'like_medium_dark', label: 'Нравится' },
    { emoji: '👍🏿', name: 'like_dark', label: 'Нравится (темный)' },
    { emoji: '👎', name: 'dislike', label: 'Не нравится' },
    { emoji: '🔥', name: 'fire', label: 'Огонь' },
    { emoji: '🎉', name: 'celebrate', label: 'Праздник' },
    { emoji: '💯', name: '100', label: '100%' },
  ];

  // Закрытие пикера при клике вне
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Проверяем, поставил ли текущий пользователь реакцию
  const hasUserReacted = (reactionName) => {
    return reactions[reactionName]?.some(r => r.user_id === currentUserId);
  };

  // Обработка клика по реакции
  const handleReactionClick = (reactionName) => {
    if (hasUserReacted(reactionName)) {
      onRemoveReaction?.(message.id, reactionName);
    } else {
      onAddReaction?.(message.id, reactionName);
    }
    setShowPicker(false);
  };

  // Получить имена пользователей для тултипа
  const getReactionUsers = (reactionName) => {
    const users = reactions[reactionName] || [];
    return users.map(u => u.full_name || u.username).join(', ');
  };

  // Определяем позицию пикера
  const getPickerPosition = () => {
    switch (position) {
      case 'top':
        return 'bottom-full mb-2';
      case 'bottom':
        return 'top-full mt-2';
      default:
        return 'bottom-full mb-2';
    }
  };

  // Группировка реакций по эмодзи
  const groupedReactions = Object.entries(reactions).reduce((acc, [reaction, users]) => {
    const emoji = availableReactions.find(r => r.name === reaction)?.emoji || reaction;
    if (!acc[emoji]) {
      acc[emoji] = {
        reaction,
        emoji,
        count: users.length,
        users
      };
    }
    return acc;
  }, {});

  return (
    <div className="relative flex items-center space-x-1">
      {/* Отображение существующих реакций */}
      {Object.values(groupedReactions).map(({ reaction, emoji, count, users }) => (
        <button
          key={reaction}
          onClick={() => handleReactionClick(reaction)}
          onMouseEnter={() => setHoveredReaction(reaction)}
          onMouseLeave={() => setHoveredReaction(null)}
          className={`
            px-2 py-1 rounded-full text-sm flex items-center space-x-1 
            transition-all transform hover:scale-105
            ${hasUserReacted(reaction) 
              ? 'bg-blue-100 text-blue-600 border border-blue-300' 
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }
          `}
        >
          <span className="text-base">{emoji}</span>
          <span className="text-xs font-medium">{count}</span>
        </button>
      ))}

      {/* Кнопка добавления реакции */}
      <button
        ref={buttonRef}
        onClick={() => setShowPicker(!showPicker)}
        className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition transform hover:scale-105"
        title="Добавить реакцию"
      >
        <FaSmile className="w-4 h-4" />
      </button>

      {/* Палетка реакций */}
      {showPicker && (
        <div
          ref={pickerRef}
          className={`absolute ${getPickerPosition()} left-1/2 transform -translate-x-1/2 z-50 bg-white rounded-lg shadow-xl p-2 border border-gray-200 min-w-[300px]`}
        >
          {/* Быстрые реакции (первые 6) */}
          <div className="grid grid-cols-6 gap-1 mb-2">
            {availableReactions.slice(0, 6).map(({ emoji, name, label }) => (
              <button
                key={name}
                onClick={() => handleReactionClick(name)}
                className={`
                  w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center 
                  text-2xl transition transform hover:scale-125
                  ${hasUserReacted(name) ? 'bg-blue-50' : ''}
                `}
                title={label}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Разделитель */}
          <div className="border-t border-gray-200 my-2"></div>

          {/* Все реакции в сетке */}
          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-1">
            {availableReactions.map(({ emoji, name, label }) => (
              <button
                key={name}
                onClick={() => handleReactionClick(name)}
                className={`
                  w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center 
                  text-lg transition transform hover:scale-125
                  ${hasUserReacted(name) ? 'bg-blue-50 ring-2 ring-blue-300' : ''}
                `}
                title={label}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Кнопка закрытия */}
          <button
            onClick={() => setShowPicker(false)}
            className="absolute top-1 right-1 p-1 text-gray-400 hover:text-gray-600"
          >
            <FaPlus className="w-3 h-3 transform rotate-45" />
          </button>
        </div>
      )}

      {/* Тултип с именами */}
      {hoveredReaction && reactions[hoveredReaction] && (
        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-50">
          {getReactionUsers(hoveredReaction)}
        </div>
      )}
    </div>
  );
};

export default MessageReactions;