import React, { useRef, useEffect } from 'react';
import { UserIcon } from './Icons';

function ChatSection({
  isChatVisible,
  username,
  messages,
  inputMessage,
  onInputChange,
  onSendMessage,
  onChatScroll
}) {
  const chatContainerRef = useRef(null);

  // 새 메시지가 올 때 자동 스크롤
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div 
      className={`chat-section ${!isChatVisible ? 'hidden' : ''}`}
      onWheel={onChatScroll}
    >
      <div className="chat-header">
        <div className="username-display">
          <UserIcon />
          <span>{username}</span>
        </div>
      </div>
      <div className="chat-messages" ref={chatContainerRef}>
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`message ${msg.sender === username ? 'own-message' : ''}`}
            style={{ whiteSpace: 'pre' }}
          >
            <span className="sender">{msg.sender}</span>
            <span className="content">{msg.content}</span>
            <span className="timestamp">
              {new Date(msg.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <form onSubmit={onSendMessage} onKeyDown={(e) => {
          if (e.key === ' ' && document.activeElement !== e.target) {
            e.preventDefault(); // 입력 필드가 아닐 때 스페이스바 기본 동작 방지
          }
        }}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="메시지를 입력하세요"
            maxLength={200}
          />
          <button type="submit">전송</button>
        </form>
      </div>
    </div>
  );
}

export default ChatSection;