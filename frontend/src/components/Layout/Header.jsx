import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/authSlice';
import { FaSignOutAlt, FaCog, FaBell } from 'react-icons/fa';

const Header = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-xl font-bold text-gray-800">Company Messenger</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <button className="p-2 text-gray-600 hover:text-blue-500">
            <FaBell className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => navigate('/settings')}
            className="p-2 text-gray-600 hover:text-blue-500"
          >
            <FaCog className="w-5 h-5" />
          </button>
          
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-2">
              {user?.full_name?.[0] || user?.username?.[0]}
            </div>
            <span className="text-gray-700">{user?.full_name || user?.username}</span>
          </div>
          
          <button
            onClick={handleLogout}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
            title="Выйти"
          >
            <FaSignOutAlt className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;