import React from 'react';
import { FaPhone, FaVideo, FaEllipsisV } from 'react-icons/fa';

const ChatHeader = ({ chat, onStartCall }) => {
  if (!chat) return null;

  return (
    <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center">
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white mr-3">
          {chat.name?.[0]}
        </div>
        <div>
          <h2 className="font-bold text-lg">{chat.name}</h2>
          <p className="text-sm text-gray-500">
            {chat.participants?.length || 0} участников
          </p>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        <button
          onClick={() => onStartCall('audio')}
          className="p-2 text-gray-600 hover:text-blue-500"
          title="Аудиозвонок"
        >
          <FaPhone className="w-5 h-5" />
        </button>
        <button
          onClick={() => onStartCall('video')}
          className="p-2 text-gray-600 hover:text-blue-500"
          title="Видеозвонок"
        >
          <FaVideo className="w-5 h-5" />
        </button>
        <button className="p-2 text-gray-600 hover:text-blue-500">
          <FaEllipsisV className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;