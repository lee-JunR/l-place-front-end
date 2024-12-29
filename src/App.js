// App.js
import React, { useState, useEffect, useRef } from 'react';
import { getRandomNickname } from '@woowa-babble/random-nickname';
import { useWebSocket } from './hooks/useWebSocket';         // ★ 추가: 커스텀 훅
import { ChatIcon, ChatCloseIcon, PaletteIcon, UserIcon, PaletteToggleIcon } from './components/Icon';
import UsernameModal from './components/UsernameModal';
import ChatSection from './components/ChatSection';
import CanvasSection from './components/CanvasSection';
import PaletteControls from './components/PaletteControls';
import Toolbar from './components/Toolbar';
import CursorLayer from './components/CursorLayer';
import './App.css';   // 스타일

// 사용할 팔레트 상수
const COLOR_PALETTE = [
  '#000000', '#666666', '#0000ff', '#00ff00',
  '#ff0000', '#ffff00', '#ffa500', '#800080',
  '#ffffff', '#333333', '#00ffff', '#008000',
  '#ff69b4', '#ffd700', '#ff4500', 'custom'
];

function App() {
  // 캔버스 관련 상수
  const CANVAS_SIZE = 256; 
  const CELL_SIZE = 16; 
  const PADDING = 20;
  const MIN_ZOOM = 1; 
  const MAX_ZOOM = 4;

  // 캔버스 픽셀 상태
  const [canvasData, setCanvasData] = useState(
    Array.from({ length: CANVAS_SIZE }, () => Array(CANVAS_SIZE).fill(null))
  );
  // 선택 색상
  const [selectedColor, setSelectedColor] = useState('#ff0000');
  // 뷰포트 (캔버스 이동/줌)
  const [viewport, setViewport] = useState({
    x: CANVAS_SIZE / 2 - CANVAS_SIZE / 4,
    y: CANVAS_SIZE / 2 - CANVAS_SIZE / 4, 
    zoom: 2,
  });

  // 채팅 상태
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  // 사용자 이름, 모달
  const usernameRef = useRef('');
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);

  // 채팅/팔레트 열림/닫힘
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isPaletteVisible, setIsPaletteVisible] = useState(true);

  // 커서 관련
  const [cursors, setCursors] = useState({});
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const chatContainerRef = useRef(null);

  const type = 'animals'; // getRandomNickname에 사용

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

  // 최초 실행
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

  const generateRandomColor = () => {
    return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
  };

  // 커스텀 훅 사용
  const {
    clientRef,    // WebSocket client (필요 시 참조)
    connect,
    disconnect
  } = useWebSocket({
    backendUrl: process.env.REACT_APP_BACKEND_API_URL,
    usernameRef,
    chatContainerRef,
    generateRandomColor,

    // 캔버스 메시지 도착 시
    onCanvasUpdate: (parsedMessage) => {
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
    },

    // 채팅 메시지 도착 시
    onChatUpdate: (chatMessage) => {
      setMessages((prev) => {
        const isDuplicate = prev.some(msg => 
          msg.sender === chatMessage.sender && 
          msg.content === chatMessage.content &&
          Math.abs(new Date(msg.timestamp) - new Date(chatMessage.timestamp)) < 1000
        );
        if (isDuplicate) return prev;
        return [...prev, chatMessage];
      });
    },

    // 커서 위치 업데이트
    onCursorUpdate: (cursorData) => {
      setCursors(prev => ({
        ...prev,
        [cursorData.username]: {
          x: cursorData.x,
          y: cursorData.y,
          color: prev[cursorData.username]?.color || generateRandomColor()
        }
      }));
    },

    // 커서 제거
    onCursorRemove: (removedUsername) => {
      setCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[removedUsername.username];
        return newCursors;
      });
    },
  });

  // mount/unmount 시점에 connect/disconnect
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line
  }, []);

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e) => {
    if (!usernameRef.current || !clientRef.current?.connected) return;

    // 커서 위치 WS 전송
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
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

    // 드래그 이동
    if (!isDragging.current) return;
    const dx = (e.clientX - dragStart.current.x);
    const dy = (e.clientY - dragStart.current.y);

    // 줌 레벨에 따른 드래그 속도
    const dragSpeed = Math.max(0.5, Math.min(2, viewport.zoom));
    setViewport((prev) => {
      const newX = prev.x - dx / (CELL_SIZE * dragSpeed);
      const newY = prev.y - dy / (CELL_SIZE * dragSpeed);

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
    // 채팅 영역 스크롤 무시
    if (e.target.closest('.chat-section')) return;
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport((prev) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseCanvasX = (e.clientX - rect.left);
      const mouseCanvasY = (e.clientY - rect.top);

      const pixelX = mouseCanvasX / (CELL_SIZE * prev.zoom) + prev.x;
      const pixelY = mouseCanvasY / (CELL_SIZE * prev.zoom) + prev.y;

      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * zoomFactor));
      const newX = pixelX - mouseCanvasX / (CELL_SIZE * newZoom);
      const newY = pixelY - mouseCanvasY / (CELL_SIZE * newZoom);

      const maxX = CANVAS_SIZE - CANVAS_SIZE / newZoom + PADDING;
      const maxY = CANVAS_SIZE - CANVAS_SIZE / newZoom + PADDING;

      return {
        zoom: newZoom,
        x: Math.max(-PADDING, Math.min(maxX, newX)),
        y: Math.max(-PADDING, Math.min(maxY, newY))
      };
    });
  };

  const handlePixelClick = async (clickedX, clickedY) => {
    if (isDragging.current) return;
    if (clickedX < 0 || clickedX >= CANVAS_SIZE || clickedY < 0 || clickedY >= CANVAS_SIZE) return;

    const pixelDTO = { x: clickedX, y: clickedY, color: selectedColor };
    try {
      // REST API 예시 (WebSocket publish로 해도 무관)
      const response = await fetch(`${process.env.REACT_APP_BACKEND_API_URL}/api/pixel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pixelDTO),
      });
      if (!response.ok) throw new Error('픽셀 업데이트 실패');

      // 로컬 상태 업데이트
      setCanvasData((prevCanvas) => {
        const newCanvas = [...prevCanvas];
        newCanvas[clickedY][clickedX] = { x: clickedX, y: clickedY, color: selectedColor };
        return newCanvas;
      });
    } catch (error) {
      console.error('픽셀 업데이트 오류:', error);
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

  const handleInputChange = (val) => {
    setInputMessage(val);
  };

  const handleChatScroll = (e) => {
    e.stopPropagation();
  };

  const toggleChat = () => setIsChatVisible((v) => !v);

  const handleColorSelect = (color) => {
    if (color === 'custom') return;
    setSelectedColor(color);
  };

  const togglePalette = () => {
    setIsPaletteVisible((v) => !v);
  };

  const handleUsernameModalOpen = () => {
    setIsUsernameModalOpen(true);
  };
  const handleUsernameModalClose = () => {
    setIsUsernameModalOpen(false);
  };
  const handleUsernameChange = (newUsername) => {
    usernameRef.current = newUsername;
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
      <CursorLayer
        cursors={cursors}
        username={usernameRef.current}
        viewport={viewport}
        cellSize={CELL_SIZE}
      />

      {/* 툴바 */}
      <Toolbar
        isChatVisible={isChatVisible}
        onToggleChat={toggleChat}
      />

      {/* 팔레트 */}
      <PaletteControls
        isPaletteVisible={isPaletteVisible}
        togglePalette={togglePalette}
        selectedColor={selectedColor}
        onColorSelect={handleColorSelect} 
        colorPalette={COLOR_PALETTE}
      />

      {/* 캔버스 */}
      <CanvasSection
        canvasData={canvasData}
        viewport={viewport}
        cellSize={CELL_SIZE}
        canvasSize={CANVAS_SIZE}
        padding={PADDING}
        onPixelClick={handlePixelClick}
      />

      {/* 채팅 */}
      <ChatSection
        isChatVisible={isChatVisible}
        username={usernameRef.current}
        messages={messages}
        inputMessage={inputMessage}
        onInputChange={handleInputChange}
        onSendMessage={handleSendMessage}
        onChatScroll={handleChatScroll}
        onUsernameClick={handleUsernameModalOpen}
      />

      {/* 유저 이름 모달 */}
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