import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useSelector, useDispatch } from 'react-redux';
import MessageItem from './MessageItem';
import ForwardModal from './ForwardModal';
import toast from 'react-hot-toast';

const MessageList = ({ 
  messages, 
  onReply, 
  onEdit, 
  onDelete,
  onReact,
  loadMore,
  hasMore,
  loadingMore
}) => {
  const { user } = useSelector(state => state.auth);
  const dispatch = useDispatch();
  
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [forwardMessages, setForwardMessages] = useState([]);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const observerRef = useRef(null);

  // Группировка сообщений по дате и отправителю
  const groupedMessages = [];
  let currentGroup = [];
  let lastSenderId = null;
  let lastDate = null;

  messages.forEach((message, index) => {
    const messageDate = format(new Date(message.sent_at), 'yyyy-MM-dd');
    const senderChanged = message.sender_id !== lastSenderId;
    const dateChanged = messageDate !== lastDate;

    if (senderChanged || dateChanged || index === 0) {
      if (currentGroup.length > 0) {
        groupedMessages.push({
          senderId: lastSenderId,
          date: lastDate,
          messages: [...currentGroup]
        });
      }
      currentGroup = [message];
    } else {
      currentGroup.push(message);
    }

    lastSenderId = message.sender_id;
    lastDate = messageDate;
  });

  if (currentGroup.length > 0) {
    groupedMessages.push({
      senderId: lastSenderId,
      date: lastDate,
      messages: currentGroup
    });
  }

  // Бесконечная прокрутка
  useEffect(() => {
    if (!loadMore || !hasMore) return;

    const options = {
      root: containerRef.current,
      rootMargin: '100px',
      threshold: 0
    };

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      });
    }, options);

    const firstMessage = document.querySelector('[data-first-message]');
    if (firstMessage) {
      observerRef.current.observe(firstMessage);
    }

    return () => observerRef.current?.disconnect();
  }, [loadMore, hasMore, loadingMore, messages]);

  // Прокрутка к последнему сообщению
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Обработчики действий
  const handleReply = (message) => {
    setReplyToMessage(message);
  };

  const handleForward = (message) => {
    setForwardMessages([message]);
    setShowForwardModal(true);
  };

  const handleForwardMultiple = () => {
    if (selectedMessages.length > 0) {
      setForwardMessages(selectedMessages);
      setShowForwardModal(true);
      setSelectionMode(false);
    }
  };

  const handleSelectMessage = (message) => {
    if (!selectionMode) return;
    
    setSelectedMessages(prev => {
      if (prev.includes(message)) {
        return prev.filter(m => m.id !== message.id);
      } else {
        return [...prev, message];
      }
    });
  };

  const handleClearSelection = () => {
    setSelectedMessages([]);
    setSelectionMode(false);
  };

  // Рендер индикатора загрузки
  const renderLoadingIndicator = () => {
    if (loadingMore) {
      return (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        </div>
      );
    }
    return null;
  };

  // Рендер режима выделения
  const renderSelectionBar = () => {
    if (!selectionMode) return null;

    return (
      <div className="sticky top-0 z-20 bg-blue-500 text-white p-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleClearSelection}
            className="p-1 hover:bg-blue-600 rounded-full transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span>Выбрано: {selectedMessages.length}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleForwardMultiple}
            disabled={selectedMessages.length === 0}
            className="px-3 py-1 bg-white text-blue-500 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Переслать
          </button>
          <button
            onClick={() => {
              if (selectedMessages.length === 1) {
                handleReply(selectedMessages[0]);
              }
            }}
            disabled={selectedMessages.length !== 1}
            className="px-3 py-1 bg-white text-blue-500 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ответить
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Удалить ${selectedMessages.length} сообщений для себя?`)) {
                selectedMessages.forEach(msg => onDelete(msg.id, 'me'));
                handleClearSelection();
              }
            }}
            className="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            Удалить
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full relative">
      {renderSelectionBar()}

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-6"
        onClick={(e) => {
          // Выход из режима выделения при клике вне сообщений
          if (!e.target.closest('.message-item')) {
            handleClearSelection();
          }
        }}
      >
        {/* Индикатор загрузки сверху */}
        {renderLoadingIndicator()}

        {/* Группы сообщений */}
        {groupedMessages.map((group, groupIndex) => {
          const groupDate = format(new Date(group.messages[0].sent_at), 'd MMMM yyyy', { locale: ru });
          const isNewDay = groupIndex === 0 || group.date !== groupedMessages[groupIndex - 1].date;

          return (
            <div key={groupIndex} className="space-y-1">
              {/* Разделитель даты */}
              {isNewDay && (
                <div className="flex items-center justify-center my-4">
                  <div className="px-3 py-1 bg-gray-200 rounded-full text-sm text-gray-600">
                    {groupDate}
                  </div>
                </div>
              )}
              
              {/* Сообщения в группе */}
              {group.messages.map((message, msgIndex) => {
                const isOwn = message.sender_id === user?.id;
                const isFirstInGroup = msgIndex === 0;
                const isLastInGroup = msgIndex === group.messages.length - 1;
                const isSelected = selectedMessages.includes(message);

                return (
                  <div
                    key={message.id || `msg-${groupIndex}-${msgIndex}`}
                    data-first-message={groupIndex === 0 && msgIndex === 0 ? 'true' : undefined}
                    className={`message-item transition ${
                      selectionMode ? 'cursor-pointer' : ''
                    } ${isSelected ? 'bg-blue-50 rounded-lg' : ''}`}
                    onClick={() => selectionMode && handleSelectMessage(message)}
                  >
                    <MessageItem
                      message={message}
                      isOwn={isOwn}
                      showAvatar={isFirstInGroup}
                      showName={group.messages.length > 1 && !isOwn}
                      previousMessage={msgIndex > 0 ? group.messages[msgIndex - 1] : null}
                      nextMessage={msgIndex < group.messages.length - 1 ? group.messages[msgIndex + 1] : null}
                      onReply={handleReply}
                      onForward={handleForward}
                      onEdit={(msg) => {
                        const newContent = prompt('Редактировать сообщение:', msg.content);
                        if (newContent && newContent !== msg.content) {
                          onEdit(msg.id, newContent);
                        }
                      }}
                      onDelete={onDelete}
                      onReact={onReact}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
        
        {/* Пустой список */}
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="mx-auto w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Нет сообщений</h3>
            <p className="text-gray-500">Начните общение, отправив первое сообщение</p>
          </div>
        )}
        
        {/* Элемент для прокрутки вниз */}
        <div ref={messagesEndRef} />
      </div>

      {/* Модалка пересылки */}
      {showForwardModal && (
        <ForwardModal
          messages={forwardMessages}
          onClose={() => {
            setShowForwardModal(false);
            setForwardMessages([]);
          }}
          onForward={() => {
            setShowForwardModal(false);
            setForwardMessages([]);
            toast.success('Сообщения пересланы');
          }}
        />
      )}

      {/* Индикатор новых сообщений (можно добавить позже) */}
      {/* <NewMessagesIndicator onClick={scrollToBottom} /> */}
    </div>
  );
};

export default MessageList;