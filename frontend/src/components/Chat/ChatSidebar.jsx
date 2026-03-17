import React from 'react';
import { FaSearch, FaPlus } from 'react-icons/fa';

const ChatSidebar = ({ chats, onSelectChat, onCreateChat }) => {
  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Чаты</h2>
          <button
            onClick={onCreateChat}
            className="p-2 bg-blue-500 text-white rounded-full"
          >
            <FaPlus className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chats.map(chat => (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat)}
            className="p-4 border-b hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white mr-3">
                {chat.name?.[0]}
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{chat.name}</h3>
                <p className="text-sm text-gray-500 truncate">
                  {chat.lastMessage || 'Нет сообщений'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatSidebar;