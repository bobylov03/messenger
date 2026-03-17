import React from 'react';
import { NavLink } from 'react-router-dom';
import { FaComments, FaCog, FaUsers } from 'react-icons/fa';

const Sidebar = () => {
  const navItems = [
    { to: '/', icon: FaComments, label: 'Чаты' },
    { to: '/contacts', icon: FaUsers, label: 'Контакты' },
    { to: '/settings', icon: FaCog, label: 'Настройки' },
  ];

  return (
    <div className="w-20 bg-white border-r border-gray-200 flex flex-col items-center py-6">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `p-3 my-2 rounded-lg ${isActive ? 'bg-blue-50 text-blue-500' : 'text-gray-600 hover:bg-gray-100'}`
          }
          title={item.label}
        >
          <item.icon className="w-6 h-6" />
        </NavLink>
      ))}
    </div>
  );
};

export default Sidebar;