// src/components/UsernameModal.js
import React, { useState } from 'react';
import { UserIcon } from './Icon';

function UsernameModal({ 
  initialUsername, 
  onClose, 
  onUsernameChange 
}) {
  const [tempUsername, setTempUsername] = useState(initialUsername);

  const handleSubmit = () => {
    if (tempUsername.trim()) {
      onUsernameChange(tempUsername.trim());
      onClose();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="username-modal">
        <div className="username-modal-header">
          <UserIcon />
          <h2>사용자 이름 설정</h2>
        </div>
        <div className="username-modal-content">
          <p>
            채팅에서 사용할 이름을 입력해주세요.<br />
            다른 사용자들에게 보여질 이름입니다.
          </p>
          <input
            type="text"
            value={tempUsername}
            onChange={(e) => setTempUsername(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="사용자 이름 입력 (2-20자)"
            maxLength={20}
            autoFocus
          />
        </div>
        <div className="modal-buttons">
          <button 
            className="modal-button cancel"
            onClick={onClose}
          >
            취소
          </button>
          <button 
            className="modal-button confirm"
            onClick={handleSubmit}
          >
            확인
          </button>
        </div>
      </div>
    </>
  );
}

export default UsernameModal;