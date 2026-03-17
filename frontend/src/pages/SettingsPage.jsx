import React from 'react';

const SettingsPage = () => {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Настройки</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">Профиль</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Имя</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input type="email" className="w-full border rounded-lg px-3 py-2" />
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium mb-4">Уведомления</h2>
        <div className="space-y-3">
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            <span>Звуковые уведомления</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            <span>Уведомления о новых сообщениях</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;