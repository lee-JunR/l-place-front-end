import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { getRandomNickname } from '@woowa-babble/random-nickname';
import { ChatIcon, ChatCloseIcon, PaletteIcon, UserIcon, PaletteToggleIcon } from './components/Icon';
import UsernameModal from './components/UsernameModal';
import ChatSection from './components/ChatSection';
import './App.css';

const COLOR_PALETTE = [
  '#000000', '#666666', '#0000ff', '#00ff00',
  '#ff0000', '#ffff00', '#ffa500', '#800080',
  '#ffffff', '#333333', '#00ffff', '#008000',
  '#ff69b4', '#ffd700', '#ff4500', 'custom'
];

function App() {
  const CANVAS_SIZE = 256; // 캔버스 크기
  const CELL_SIZE = 16; // 셀 크기 
  const PADDING = 20; // 패딩 영역 추가
  const MIN_ZOOM = 1; // 최소 줌 레벨
  const MAX_ZOOM = 4; // 최대 줌 레벨

  const [canvasData, setCanvasData] = useState(
    Array.from({ length: CANVAS_SIZE }, () => Array(CANVAS_SIZE).fill(null))
  );
  const [selectedColor, setSelectedColor] = useState('#ff0000');

  const [viewport, setViewport] = useState({
    x: CANVAS_SIZE / 2 - CANVAS_SIZE / 4,
    y: CANVAS_SIZE / 2 - CANVAS_SIZE / 4, 
    zoom: 2,
  });
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const usernameRef = useRef('');
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isPaletteVisible, setIsPaletteVisible] = useState(true);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);

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
      const response = await fetch(`${process.env.REACT_APP_BACKEND_API_URL}/api/canvas`);
      const data = await response.json();

      const initialCanvas = Array.from({ length: CANVAS_SIZE }, () =>
        Array(CANVAS_SIZE).fill(null)
      );
      data.forEach(({ x, y, color }) => {
        if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
          initialCanvas[y][x] = { x, y, color };
        }
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
    let stompClient = null;
    let subscriptions = new Set();

    const connect = () => {
      if (stompClient) {
        console.log('이미 연결이 존재합니다.');
        return;
      }

      stompClient = new Client({
        webSocketFactory: () => new SockJS(`${process.env.REACT_APP_BACKEND_API_URL}/ws`),
        reconnectDelay: 5000,
        onConnect: () => {
          console.log('WebSocket 연결됨');
          
          // 기존 구독 모두 해제
          subscriptions.forEach(sub => sub.unsubscribe());
          subscriptions.clear();

          // 캔버스 구독
          const canvasSub = stompClient.subscribe('/topic/canvas', (message) => {
            const parsedMessage = JSON.parse(message.body);
            setCanvasData((prevCanvas) => {
              const newCanvas = [...prevCanvas];
              if (parsedMessage.updates && Array.isArray(parsedMessage.updates)) {
                parsedMessage.updates.forEach(({ x, y, color }) => {
                  if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
                    newCanvas[y][x] = { x, y, color };
                  }
                });
              } else if (parsedMessage.x !== undefined && parsedMessage.y !== undefined) {
                const { x, y, color } = parsedMessage;
                if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
                  newCanvas[y][x] = { x, y, color };
                }
              }
              return newCanvas;
            });
          });
          subscriptions.add(canvasSub);

        const chatSub = stompClient.subscribe('/topic/chat', (message) => {
          const chatMessage = JSON.parse(message.body);
          setMessages(prev => {
            const isDuplicate = prev.some(msg => 
              msg.sender === chatMessage.sender && 
              msg.content === chatMessage.content &&
              Math.abs(new Date(msg.timestamp) - new Date(chatMessage.timestamp)) < 1000
            );

            if (isDuplicate) return prev;
            return [...prev, chatMessage];          
          
            // 새 메시지가 오면 자동 스크롤
            if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
          });
        });
        subscriptions.add(chatSub);

        // 커서 위치 구독 추가
        const cursorSub = stompClient.subscribe('/topic/cursors', (message) => {
          const cursorData = JSON.parse(message.body);
          setCursors(prev => ({
            ...prev,
            [cursorData.username]: {
              x: cursorData.x,
              y: cursorData.y,
              color: prev[cursorData.username]?.color || generateRandomColor()
            }
          }));
        });
        subscriptions.add(cursorSub);

        // 커서 제거 메시지 구독 추가
        const cursorRemoveSub = stompClient.subscribe('/topic/cursors/remove', (message) => {
          const removedUsername = JSON.parse(message.body);
          console.log(removedUsername);
          setCursors(prev => {
            const newCursors = { ...prev };
            delete newCursors[removedUsername.username];
            console.log(newCursors);
            
            return newCursors;
          });
        });
        subscriptions.add(cursorRemoveSub);
      },
      onDisconnect: () => {
        console.log('WebSocket 연결 해제됨');
      },
      onStompError: (frame) => {
        console.error('STOMP 에러:', frame);
      }
    });

    clientRef.current = stompClient;
    stompClient.activate();
  };

  connect();

    // 페이지 가시성 변경 이벤트 핸들러
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && clientRef.current) {
        clientRef.current.publish({
          destination: '/app/cursors/remove',
          body: JSON.stringify({ username: usernameRef.current }),
        });
      }
    };

    // 이벤트 리스너 등록
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // 정리 함수
      if (document.visibilityState === 'hidden' && clientRef.current) {
        clientRef.current.publish({
          destination: '/app/cursors/remove',
          body: JSON.stringify({ username: usernameRef.current }),
        });
      }

      subscriptions.forEach(sub => sub.unsubscribe());
      subscriptions.clear();
      
      if (clientRef.current?.connected) {
        clientRef.current.deactivate();
      }
      
      clientRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stompClient = null;
    };
  }, []);

  // 캔버스 렌더링
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;

    // 현재 캔버스 크기 가져오기
    const currentWidth = canvas.width || window.innerWidth;
    const currentHeight = canvas.height || window.innerHeight;

    // 캔버스 크기가 창 크기와 다르면 업데이트
    if (currentWidth !== window.innerWidth || currentHeight !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    context.clearRect(0, 0, currentWidth, currentHeight);
    context.imageSmoothingEnabled = false;

    const scaledCellSize = CELL_SIZE / viewport.zoom;

    // 렌더링할 영역 계산
    const startX = Math.max(0, Math.floor(viewport.x - PADDING));
    const startY = Math.max(0, Math.floor(viewport.y - PADDING));
    const endX = Math.min(CANVAS_SIZE, Math.ceil(viewport.x + currentWidth/scaledCellSize + PADDING));
    const endY = Math.min(CANVAS_SIZE, Math.ceil(viewport.y + currentHeight/scaledCellSize + PADDING));

    // 픽셀 렌더링
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
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
  }, [canvasData, viewport, renderCanvas]);

  const handleMouseDown = (e) => {
    if (e.button === 0) { // 좌클릭만 처리
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e) => {
    if (!usernameRef.current || !clientRef.current || !clientRef.current.connected) return;

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

    const dx = (e.clientX - dragStart.current.x);
    const dy = (e.clientY - dragStart.current.y);
    
    // 줌 레벨에 따른 드래그 속도 조정
    const dragSpeed = Math.max(0.5, Math.min(2, viewport.zoom));
    
    setViewport((prev) => {
        const newX = prev.x - dx / (CELL_SIZE * dragSpeed);
        const newY = prev.y - dy / (CELL_SIZE * dragSpeed);
        
        // 경계 확인
        const maxX = CANVAS_SIZE - CANVAS_SIZE / prev.zoom + PADDING;
        const maxY = CANVAS_SIZE - CANVAS_SIZE / prev.zoom + PADDING;
        
        return {
            ...prev,
            x: Math.max(-PADDING, Math.min(maxX, newX)),
            y: Math.max(-PADDING, Math.min(maxY, newY))
        };
    });

    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e) => {
    // 채팅 영역에서의 휠 이벤트는 무시
    if (e.target.closest('.chat-section')) {
      return;
    }
    
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    
    setViewport((prev) => {
      const rect = canvasRef.current.getBoundingClientRect();
      
      // 현재 마우스 위치의 캔버스 좌표 계산
      const mouseCanvasX = (e.clientX - rect.left);
      const mouseCanvasY = (e.clientY - rect.top);
      
      // 현재 마우스 위치의 실제 픽셀 좌표 계산
      const pixelX = mouseCanvasX / (CELL_SIZE * prev.zoom) + prev.x;
      const pixelY = mouseCanvasY / (CELL_SIZE * prev.zoom) + prev.y;
      
      // 새로운 줌 레벨 계산
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * zoomFactor));
      
      // 새로운 뷰포트 위치 계산
      // 마우스 커서 위치의 픽셀이 화면상 같은 위치를 유지하도록 조정
      const newX = pixelX - mouseCanvasX / (CELL_SIZE * newZoom);
      const newY = pixelY - mouseCanvasY / (CELL_SIZE * newZoom);
      
      // 경계 확인
      const maxX = CANVAS_SIZE - CANVAS_SIZE / newZoom + PADDING;
      const maxY = CANVAS_SIZE - CANVAS_SIZE / newZoom + PADDING;
      
      return {
        zoom: newZoom,
        x: Math.max(-PADDING, Math.min(maxX, newX)),
        y: Math.max(-PADDING, Math.min(maxY, newY))
      };
    });
  };

  const toggleChat = () => setIsChatVisible(!isChatVisible);

  const handleCanvasClick = async (e) => {
    if (isDragging.current) return; // 드래그 중 클릭 방지

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaledCellSize = CELL_SIZE / viewport.zoom;

    const clickedX = Math.floor((e.clientX - rect.left) / scaledCellSize + viewport.x);
    const clickedY = Math.floor((e.clientY - rect.top) / scaledCellSize + viewport.y);

    if (clickedX >= 0 && clickedX < CANVAS_SIZE && clickedY >= 0 && clickedY < CANVAS_SIZE) {
      const pixelDTO = { x: clickedX, y: clickedY, color: selectedColor };
      try {
        // const response = await fetch('http://localhost:8080/api/pixel', {
        const response = await fetch(`${process.env.REACT_APP_BACKEND_API_URL}/api/pixel`, { // 변경된 부분
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pixelDTO),
        });
        
        if (!response.ok) throw new Error('픽셀 업데이트 실패');
        
        setCanvasData((prevCanvas) => {
          const newCanvas = [...prevCanvas];
          newCanvas[clickedY][clickedX] = { x: clickedX, y: clickedY, color: selectedColor };
          return newCanvas;
        });
      } catch (error) {
        console.error('픽셀 업데이트 오류:', error);
      }
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !usernameRef.current.trim()) return;

    const message = { 
      sender: usernameRef.current.trim(), 
      content: inputMessage.trim(), 
      timestamp: Date.now() 
    };
    
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: '/app/chat/send',
        body: JSON.stringify(message),
      });
      setInputMessage('');
    }
  };

  const handleInputChange = (newValue) => {
    setInputMessage(newValue);
  };

  // 캔버스 크기 설정을 위한 새로운 함수 추가
  const updateCanvasSize = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const currentWidth = canvas.width;
      const currentHeight = canvas.height;
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      if (currentWidth !== newWidth || currentHeight !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        // viewport 상태 업데이트를 통해 리렌더링 트리거
        setViewport(prev => ({...prev}));
      }
    }
  };

  // useEffect에서 초기 설정과 resize 이벤트 처리
  useEffect(() => {
    // 초기 캔버스 크기 설정
    updateCanvasSize();
    
    let resizeTimeout;
    const handleResize = () => {
      // 디바운스 처리
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateCanvasSize();
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // viewport나 canvasData가 변경될 때마다 캔버스 업데이트
  useEffect(() => {
    requestAnimationFrame(renderCanvas);
  }, [viewport, canvasData]);

  // 채팅창 스크롤 이벤트 처리
  const handleChatScroll = (e) => {
    e.stopPropagation();
  };

  // 색상 선택 처리 함수 추가
  const handleColorSelect = (color) => {
    if (color === 'custom') {
      // 커스텀 색상은 input의 onChange에서 처리
      return;
    }
    setSelectedColor(color);
  };

  // 팔레트 토글 함수 수정
  const togglePalette = () => {
    setIsPaletteVisible(!isPaletteVisible);
  };

  // 사용자 이름 관련 핸들러
  const handleUsernameModalOpen = () => {
    setIsUsernameModalOpen(true);
  };

  const handleUsernameModalClose = () => {
    setIsUsernameModalOpen(false);
  };

  const handleUsernameChange = (newUsername) => {
    usernameRef.current = newUsername;
  };

  const generateRandomColor = () => {
    // 랜덤 색상 생성 로직 추가
    return `#${Math.floor(Math.random()*16777215).toString(16)}`;
  };

  return (
    <div
      className="app-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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
            <div 
              className="cursor-pointer"
              style={{ backgroundColor: position.color }}
            ></div>
            <div 
              className="cursor-username"
              style={{ 
                border: `2px solid ${position.color}`,
                backgroundColor: 'rgba(0, 0, 0, 0.5)'
              }}
            >
              {cursorUsername}
            </div>
          </div>
        )
      ))}
      
      <div className="toolbar">
        <div className="logo">
          <span className="l">l</span>
          <span className="slash">/</span>
          <span className="place">place</span>
        </div>
        <button 
          className={`icon-button toggle-chat ${!isChatVisible ? 'chat-hidden' : ''}`} 
          onClick={toggleChat}
          title={isChatVisible ? '채팅 숨기기' : '채팅 보기'}
        >
          {isChatVisible ? <ChatCloseIcon /> : <ChatIcon />}
        </button>
      </div>
      
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        className="canvas"
        onClick={handleCanvasClick}
      />
      
      <div className="palette-controls">
        <button 
          className={`palette-toggle ${isPaletteVisible ? 'active' : ''}`}
          onClick={togglePalette}
          title={isPaletteVisible ? '팔레트 숨기기' : '팔레트 보기'}
        >
          <PaletteToggleIcon />
        </button>
        <div className={`color-picker ${!isPaletteVisible ? 'hidden' : ''}`}>
          {COLOR_PALETTE.map((color) => (
            color === 'custom' ? (
              <div 
                key={color} 
                className={`custom-color-button ${selectedColor === color ? 'selected' : ''}`}
              >
                <input
                  type="color"
                  className="custom-color-input"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ) : (
              <div
                key={color}
                className={`color-swatch ${selectedColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleColorSelect(color);
                }}
              />
            )
          ))}
        </div>
      </div>

      <ChatSection
        isChatVisible={isChatVisible}
        username={usernameRef.current}
        messages={messages}
        inputMessage={inputMessage}
        onInputChange={handleInputChange}
        onSendMessage={handleSendMessage}
        onChatScroll={handleChatScroll}
        onUsernameClick={handleUsernameModalOpen}
        chatContainerRef={chatContainerRef}
      />

      {isUsernameModalOpen && (
        <UsernameModal
          initialUsername={usernameRef.current}
          onClose={handleUsernameModalClose}
          onUsernameChange={handleUsernameChange}
        />
      )}
    </div>
  );
}

export default App;

