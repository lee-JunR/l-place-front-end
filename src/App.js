import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { getRandomNickname } from '@woowa-babble/random-nickname';
import './App.css';

function App() {
  const CANVAS_SIZE = 256; // 캔버스 크기
  const CELL_SIZE = 16; // 셀 크기
  const PADDING = 20; // 패딩 영역 추가

  const [canvasData, setCanvasData] = useState(
    Array.from({ length: CANVAS_SIZE }, () => Array(CANVAS_SIZE).fill(null))
  );
  const [selectedColor, setSelectedColor] = useState('#ff0000');

  const [viewport, setViewport] = useState({
    x: CANVAS_SIZE / 2 - CANVAS_SIZE / 4, // 초기 x 좌표
    y: CANVAS_SIZE / 2 - CANVAS_SIZE / 4, // 초기 y 좌표
    zoom: 2, // 초기 줌 레벨 (기본 확대된 상태)
  });
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const usernameRef = useRef('');
  const [isChatVisible, setIsChatVisible] = useState(true);

  const canvasRef = useRef(null);
  const chatContainerRef = useRef(null);
  const clientRef = useRef(null);

  // 커서 관련
  const [cursors, setCursors] = useState({});
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const type = 'animals'; // animals, heroes, characters, monsters


  // 초기 데이터 가져오기
  const fetchCanvasData = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/canvas');
      const data = await response.json();

      const initialCanvas = Array.from({ length: CANVAS_SIZE }, () =>
        Array(CANVAS_SIZE).fill(null)
      );
      data.forEach(({ x, y, color }) => {
        initialCanvas[y][x] = { x, y, color };
      });

      setCanvasData(initialCanvas);
    } catch (error) {
      console.error('캔버스 데이터 가져오기 오류:', error);
    }
  };

  useEffect(() => {
    fetchCanvasData();

    usernameRef.current = getRandomNickname(type);
    // 캔버스 정 중앙에서 시작
    const initialZoom = 2;
    const visibleCells = CANVAS_SIZE / initialZoom;
    setViewport({
      x: CANVAS_SIZE / 2 - visibleCells / 2,
      y: CANVAS_SIZE / 2 - visibleCells / 2,
      zoom: initialZoom,
    });
  }, []);

  // WebSocket 설정
  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/topic/canvas', (message) => {
          const parsedMessage = JSON.parse(message.body);
          if (parsedMessage.updates && Array.isArray(parsedMessage.updates)) {
            setCanvasData((prevCanvas) => {
              const newCanvas = [...prevCanvas];
              parsedMessage.updates.forEach(({ x, y, color }) => {
                newCanvas[y][x] = { x, y, color };
              });
              return newCanvas;
            });
          } else if (parsedMessage.x !== undefined && parsedMessage.y !== undefined) {
            const { x, y, color } = parsedMessage;
            setCanvasData((prevCanvas) => {
              const newCanvas = [...prevCanvas];
              newCanvas[y][x] = { x, y, color };
              return newCanvas;
            });
          }
        });

        client.subscribe('/topic/chat', (message) => {
          const chatMessage = JSON.parse(message.body);
          setMessages((prev) => [...prev, chatMessage]);
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        });

        // 커서 위치 구독 추가
        client.subscribe('/topic/cursors', (message) => {
          const cursorData = JSON.parse(message.body);
          setCursors(prev => ({
            ...prev,
            [cursorData.username]: { x: cursorData.x, y: cursorData.y }
          }));
        });

        // 커서 제거 메시지 구독 추가
        client.subscribe('/topic/cursors/remove', (message) => {
          const removedUsername = JSON.parse(message.body);
          console.log(removedUsername);
          setCursors(prev => {
            const newCursors = { ...prev };
            delete newCursors[removedUsername.username];
            console.log(newCursors);
            
            return newCursors;
          });
        });
      },
    });

    clientRef.current = client;
    client.activate();

    // 브라우저 종료시 커서 위치 전송
    const handleBeforeUnload = () => {
      if (clientRef.current) {
        clientRef.current.publish({
          destination: '/app/cursors/remove',
          body: JSON.stringify({ username : usernameRef.current }),
        });
        console.log(usernameRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      client.deactivate();
      clientRef.current = null;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 캔버스 렌더링
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);

    const scaledCellSize = CELL_SIZE / viewport.zoom;

    for (let y = -PADDING; y < CANVAS_SIZE + PADDING; y++) {
      for (let x = -PADDING; x < CANVAS_SIZE + PADDING; x++) {
        const pixel = canvasData[y]?.[x];
        context.fillStyle = pixel?.color || '#ffffff';
        context.fillRect(
          (x - viewport.x) * scaledCellSize,
          (y - viewport.y) * scaledCellSize,
          scaledCellSize,
          scaledCellSize
        );
      }
    }
  };

  useEffect(() => {
    renderCanvas();
  }, [canvasData, viewport]);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!usernameRef.current || !clientRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 실제 캔버스 좌표로 변환
    const canvasX = Math.floor(x / (CELL_SIZE / viewport.zoom) + viewport.x);
    const canvasY = Math.floor(y / (CELL_SIZE / viewport.zoom) + viewport.y);

    clientRef.current.publish({
      destination: '/app/cursors',
      body: JSON.stringify({
        username: usernameRef.current,
        x: canvasX,
        y: canvasY
      })
    });

    if (!isDragging.current) return;

    const dx = (dragStart.current.x - e.clientX) / CELL_SIZE / viewport.zoom;
    const dy = (dragStart.current.y - e.clientY) / CELL_SIZE / viewport.zoom;

    setViewport((prev) => ({
      ...prev,
      x: Math.max(-PADDING, Math.min(CANVAS_SIZE - CANVAS_SIZE / prev.zoom + PADDING, prev.x + dx)),
      y: Math.max(-PADDING, Math.min(CANVAS_SIZE - CANVAS_SIZE / prev.zoom + PADDING, prev.y + dy)),
    }));

    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.8 : 1.2; // 스크롤 업/다운으로 줌 인/아웃
    setViewport((prev) => {
      const newZoom = Math.max(1, Math.min(4, prev.zoom * zoomFactor)); // 줌 레벨 제한
      const scaledWidth = CANVAS_SIZE / newZoom;
      const scaledHeight = CANVAS_SIZE / newZoom;

      // 마우스 위치를 기준으로 뷰포트 재조정
      const mouseX = e.clientX / CELL_SIZE;
      const mouseY = e.clientY / CELL_SIZE;

      const newX = Math.max(
        -PADDING,
        Math.min(CANVAS_SIZE - scaledWidth + PADDING, prev.x + (mouseX / prev.zoom - mouseX / newZoom))
      );
      const newY = Math.max(
        -PADDING,
        Math.min(CANVAS_SIZE - scaledHeight + PADDING, prev.y + (mouseY / prev.zoom - mouseY / newZoom))
      );

      return {
        ...prev,
        zoom: newZoom,
        x: newX,
        y: newY,
      };
    });
  };

  const toggleChat = () => setIsChatVisible(!isChatVisible);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaledCellSize = CELL_SIZE / viewport.zoom;

    const clickedX = Math.floor((e.clientX - rect.left) / scaledCellSize + viewport.x);
    const clickedY = Math.floor((e.clientY - rect.top) / scaledCellSize + viewport.y);

    if (clickedX >= 0 && clickedX < CANVAS_SIZE && clickedY >= 0 && clickedY < CANVAS_SIZE) {
      const pixelDTO = { x: clickedX, y: clickedY, color: selectedColor };
      fetch('http://localhost:8080/api/pixel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pixelDTO),
      }).then(() => {
        setCanvasData((prevCanvas) => {
          const newCanvas = [...prevCanvas];
          newCanvas[clickedY][clickedX] = { x: clickedX, y: clickedX, color: selectedColor };
          return newCanvas;
        });
      });
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !usernameRef.current.trim()) return;

    const message = { sender: usernameRef.current, content: inputMessage, timestamp: Date.now() };
    clientRef.current.publish({
      destination: '/app/chat/send',
      body: JSON.stringify(message),
    });
    setInputMessage('');
  };

  const handleUsernameChange = (e) => {
    const newUsername = e.target.value;
    const oldUsername = usernameRef.current;
    
    // 기존 커서 데이터를 새 사용자 이름으로 이동
    setCursors(prev => {
      const newCursors = { ...prev };
      if (prev[oldUsername]) {
        newCursors[newUsername] = prev[oldUsername];
        delete newCursors[oldUsername];
      }
      return newCursors;
    });
    
    usernameRef.current = newUsername;
  };

  return (
    <div
      className="app-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* 다른 사용자들의 커서 렌더링 */}
      {Object.entries(cursors).map(([cursorUsername, position]) => (
        usernameRef.current !== cursorUsername && (
          <div
            key={cursorUsername}
            className="cursor"
            style={{
              left: `${(position.x - viewport.x) * (CELL_SIZE / viewport.zoom)}px`,
              top: `${(position.y - viewport.y) * (CELL_SIZE / viewport.zoom)}px`
            }}
          >
            <div className="cursor-pointer"></div>
            <div className="cursor-username">{cursorUsername}</div>
          </div>
        )
      ))}
      
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        className="canvas"
        onClick={handleCanvasClick}
      />
      <button className="toggle-chat" onClick={toggleChat}>
        {isChatVisible ? 'Hide Chat' : 'Show Chat'}
      </button>
      {isChatVisible && (
        <div className="chat-section">
          <div className="username-display">
            <strong>사용자 이름:</strong> {usernameRef.current}
          </div>
          <div className="chat-messages" ref={chatContainerRef}>
            {messages.map((msg, index) => (
              <div key={index} className="message">
                <span className="sender">{msg.sender}: </span>
                <span className="content">{msg.content}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMessage}>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="메시지 입력"
            />
            <button type="submit">전송</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
