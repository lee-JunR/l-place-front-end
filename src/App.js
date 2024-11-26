import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import './App.css';

function App() {
  const [canvasData, setCanvasData] = useState([]);
  const [selectedColor, setSelectedColor] = useState('#ff0000');
  const [isConnected, setIsConnected] = useState(false);

  // 채팅 관련
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [username, setUsername] = useState('');
  const chatContainerRef = useRef(null);
  const clientRef = useRef(null);

  useEffect(() => {
    // WebSocket 설정
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'), // WebSocket 엔드포인트
      reconnectDelay: 5000, // 연결 실패 시 5초 후 재시도
      onConnect: () => {
        setIsConnected(true);
        console.log('WebSocket 연결 성공');
        client.subscribe('/topic/canvas', (message) => {
          const pixel = JSON.parse(message.body);
          setCanvasData((prevData) => {
            const updatedData = [...prevData];
            const index = updatedData.findIndex((p) => p.x === pixel.x && p.y === pixel.y);
            if (index !== -1) {
              updatedData[index] = pixel; // 이미 있는 픽셀 업데이트
            } else {
              updatedData.push(pixel); // 새로운 픽셀 추가
            }
            return updatedData;
          });
        });

        // 채팅 구독 추가
        client.subscribe('/topic/chat', (message) => {
          const chatMessage = JSON.parse(message.body);
          console.log(chatMessage);
          setMessages(prev => [...prev, chatMessage]);
          // 새 메시지가 오면 스크롤을 아래로
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        });

      },
      onError: (error) => {
        setIsConnected(false);
        console.error('WebSocket 연결 실패:', error);
      },
    });

    clientRef.current = client;  // ref에 client 저장
    client.activate();

    return () => {
      client.deactivate();
      clientRef.current = null;
    };
  }, []);

  useEffect(()  => {
    // 초기 캔버스 데이터 가져오기
    fetch('http://localhost:8080/api/canvas')
      .then((response) => response.json())
      .then((data) => setCanvasData(data))
      .catch((error) => console.error('Error fetching canvas data:', error));
  }, []);

  const handleCellClick = (x, y) => {
    const pixelDTO = { x, y, color: selectedColor };
    // 서버에 픽셀 업데이트 요청
    fetch('http://localhost:8080/api/pixel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pixelDTO),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(`픽셀 업데이트 ${x}, ${y}`);
      })
      .catch((error) => console.error('Error updating pixel:', error));
  };

   // 채팅 메시지 전송 핸들러
   const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !username.trim()) return;

    const message = {
      sender: username,
      content: inputMessage,
      timestamp: null // 서버에서 설정됨
    };

    clientRef.current.publish({
      destination: '/app/chat/send',
      body: JSON.stringify(message)
    });

    setInputMessage('');
  };
  return (
    <div className="app-container">
      <h1>l/place</h1>
      <div className="main-content">
        <div className="canvas-section">
          <div>
            <label>Select Color: </label>
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
            />
          </div>
          <div className="grid">
            {Array.from({ length: 20 }).map((_, rowIndex) =>
              Array.from({ length: 20 }).map((_, colIndex) => {
                const pixel = canvasData.find((p) => p.x === colIndex && p.y === rowIndex);
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className="cell"
                    style={{ backgroundColor: pixel ? pixel.color : '#fff' }}
                    onClick={() => handleCellClick(colIndex, rowIndex)}
                  />
                );
              })
            )}
          </div>
          {!isConnected && <p>WebSocket 연결 실패</p>}
        </div>

        <div className="chat-section">
          <div className="username-input">
            <input
              type="text"
              placeholder="사용자 이름을 입력하세요"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="chat-messages" ref={chatContainerRef}>
            {messages.map((msg, index) => (
              <div key={index} className="message">
                <span className="sender">{msg.sender}: </span>
                <span className="content">{msg.content}</span>
                <span className="timestamp">
                  {`${new Date(msg.timestamp).getHours()}시${new Date(msg.timestamp).getMinutes()}분`}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMessage} className="chat-input-form">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="메시지를 입력하세요"
            />
            <button type="submit">전송</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
