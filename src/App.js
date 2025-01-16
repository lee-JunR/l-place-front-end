// App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { getRandomNickname } from '@woowa-babble/random-nickname';
import './App.css';

// 하위 컴포넌트 import
import Toolbar from './components/Toolbar';
import PaletteControls from './components/PaletteControls';
import ChatSection from './components/ChatSection';
import CursorLayer from './components/CursorLayer';
import CanvasSection from './components/CanvasSection';

const CANVAS_SIZE = 256; // 캔버스 크기
const CELL_SIZE = 16;    // 셀 크기
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

// 재연결 관련 상수
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;

// 사용할 색상 팔레트
const COLOR_PALETTE = [
  '#000000', '#666666', '#0000ff', '#00ff00',
  '#ff0000', '#ffff00', '#ffa500', '#800080',
  '#ffffff', '#333333', '#00ffff', '#008000',
  '#ff69b4', '#ffd700', '#ff4500', 'custom'
];

// 랜덤 색상 생성 (커서 표시 용)
const generateRandomColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 50%)`;
};

function App() {
  const [canvasData, setCanvasData] = useState(
    Array.from({ length: CANVAS_SIZE }, () => Array(CANVAS_SIZE).fill(null))
  );
  const [selectedColor, setSelectedColor] = useState('#ff0000');

  const [viewport, setViewport] = useState({
    x: CANVAS_SIZE / 2 - CANVAS_SIZE / 4,
    y: CANVAS_SIZE / 2 - CANVAS_SIZE / 4,
    zoom: 2,
  });

  // 채팅
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  // 채팅/팔레트 표시 여부
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isPaletteVisible, setIsPaletteVisible] = useState(true);

  // 커서
  const [cursors, setCursors] = useState({});

  // 픽셀 클릭 시 강조 표시용
  const [placedPixels, setPlacedPixels] = useState([]);

  // 스페이스바 누름 상태
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // 닉네임, STOMP 클라이언트, 캔버스 참조
  const usernameRef = useRef('');
  const mainCanvasRef = useRef(null);
  const clientRef = useRef(null);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // ------------------
  // 초기 데이터 가져오기
  // ------------------
  const fetchCanvasData = async () => {
    try {
      // 실제 백엔드 API 경로로 수정
      const response = await fetch('http://localhost:8080/api/canvas', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw new Error('캔버스 데이터 가져오기 실패');

      const pixels = await response.json();

      const initialCanvas = Array.from({ length: CANVAS_SIZE }, (_, y) =>
        Array.from({ length: CANVAS_SIZE }, (_, x) => ({
          x,
          y,
          color: '#FFFFFF',
        }))
      );

      pixels.forEach(pixel => {
        if (
          pixel &&
          pixel.x >= 0 && pixel.x < CANVAS_SIZE &&
          pixel.y >= 0 && pixel.y < CANVAS_SIZE
        ) {
          initialCanvas[pixel.y][pixel.x] = {
            x: pixel.x,
            y: pixel.y,
            color: pixel.color,
          };
        }
      });

      setCanvasData(initialCanvas);
    } catch (error) {
      console.error('캔버스 데이터 가져오기 오류:', error);
    }
  };

  // ------------------
  // 마운트 시점 초기화
  // ------------------
  useEffect(() => {
    fetchCanvasData();

    // 닉네임 설정
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
      usernameRef.current = savedUsername;
    } else {
      const newUsername = getRandomNickname('animals');
      usernameRef.current = newUsername;
      localStorage.setItem('username', newUsername);
    }

    // 화면 크기에 맞춰 초기 줌 계산
    const windowAspect = window.innerWidth / window.innerHeight;
    const canvasAspect = CANVAS_SIZE / CANVAS_SIZE;

    let initialZoom;
    if (windowAspect > canvasAspect) {
      // 화면이 더 넓은 경우 -> 높이에 맞춤
      initialZoom = window.innerHeight / (CANVAS_SIZE * CELL_SIZE);
    } else {
      // 화면이 더 좁은 경우 -> 너비에 맞춤
      initialZoom = window.innerWidth / (CANVAS_SIZE * CELL_SIZE);
    }
    initialZoom *= 0.9;
    initialZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialZoom));

    // 중앙 정렬
    const centerX = (CANVAS_SIZE - window.innerWidth / (CELL_SIZE * initialZoom)) / 2;
    const centerY = (CANVAS_SIZE - window.innerHeight / (CELL_SIZE * initialZoom)) / 2;
    setViewport({ x: centerX, y: centerY, zoom: initialZoom });
  }, []);

  // ------------------
  // WebSocket 연결
  // ------------------
  useEffect(() => {
    let stompClient = null;
    let subscriptions = new Set();
    let reconnectAttempts = 0;
    let reconnectTimeout = null;

    const handleCanvasMessage = (message) => {
      try {
        const pixelData = JSON.parse(message.body);
        if (
          pixelData &&
          typeof pixelData.x === 'number' &&
          typeof pixelData.y === 'number' &&
          pixelData.color
        ) {
          setCanvasData(prevCanvas => {
            const newCanvas = prevCanvas.map(row => row.slice());
            newCanvas[pixelData.y][pixelData.x] = {
              x: pixelData.x,
              y: pixelData.y,
              color: pixelData.color,
            };
            return newCanvas;
          });
        }
      } catch (error) {
        console.error('캔버스 메시지 처리 오류:', error);
      }
    };

    const handleChatMessage = (message) => {
      try {
        const chatMessage = JSON.parse(message.body);
        setMessages(prev => {
          // 중복 메시지 필터
          const isDuplicate = prev.some(msg =>
            msg.sender === chatMessage.sender &&
            msg.content === chatMessage.content &&
            Math.abs(new Date(msg.timestamp) - new Date(chatMessage.timestamp)) < 1000
          );
          if (isDuplicate) return prev;        
          return [...prev, chatMessage];
        });
      } catch (error) {
        console.error('채팅 메시지 처리 오류:', error);
      }
    };

    const handleCursorMessage = (message) => {
      try {
        const cursorData = JSON.parse(message.body);
        setCursors(prev => ({
          ...prev,
          [cursorData.username]: {
            x: cursorData.x,
            y: cursorData.y,
            color: prev[cursorData.username]?.color || generateRandomColor(),
            timestamp: Date.now()
          }
        }));
      } catch (error) {
        console.error('커서 메시지 처리 오류:', error);
      }
    };

    const handleCursorRemoveMessage = (message) => {
      try {
        const removedUsername = JSON.parse(message.body);
        setCursors(prev => {
          const newCursors = { ...prev };
          delete newCursors[removedUsername.username];
          return newCursors;
        });
      } catch (error) {
        console.error('커서 제거 메시지 처리 오류:', error);
      }
    };

    const connect = () => {
      if (stompClient?.connected) {
        console.log('이미 연결되어 있습니다.');
        return;
      }
      try {
        stompClient = new Client({
          webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
          reconnectDelay: 0,
          onConnect: () => {
            console.log('WebSocket 연결 성공');
            reconnectAttempts = 0;

            subscriptions.forEach(sub => sub?.unsubscribe());
            subscriptions.clear();

            try {
              const canvasSub = stompClient.subscribe('/topic/canvas', handleCanvasMessage);
              const chatSub = stompClient.subscribe('/topic/chat', handleChatMessage);
              const cursorSub = stompClient.subscribe('/topic/cursors', handleCursorMessage);
              const cursorRemoveSub = stompClient.subscribe('/topic/cursors/remove', handleCursorRemoveMessage);

              subscriptions.add(canvasSub);
              subscriptions.add(chatSub);
              subscriptions.add(cursorSub);
              subscriptions.add(cursorRemoveSub);

              clientRef.current = stompClient;
            } catch (error) {
              console.error('구독 설정 중 오류:', error);
              handleDisconnect();
            }
          },
          onStompError: (frame) => {
            console.error('STOMP 오류:', frame);
            handleDisconnect();
          },
          onWebSocketError: (event) => {
            console.error('WebSocket 오류:', event);
            handleDisconnect();
          },
          onDisconnect: () => {
            console.log('WebSocket 연결 해제');
            handleDisconnect();
          }
        });

        stompClient.activate();
      } catch (error) {
        console.error('WebSocket 연결 시도 오류:', error);
        handleDisconnect();
      }
    };

    const handleDisconnect = () => {
      clientRef.current = null;
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`재연결 시도 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY);
      } else {
        console.error('최대 재연결 시도 횟수 초과');
      }
    };

    // 페이지 가시성 변경 -> 커서 제거
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && clientRef.current) {
        clientRef.current.publish({
          destination: '/app/cursors/remove',
          body: JSON.stringify({ username: usernameRef.current }),
        });
      }
    };

    connect();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(reconnectTimeout);
      subscriptions.forEach(sub => sub.unsubscribe());
      subscriptions.clear();

      if (stompClient?.connected) {
        stompClient.deactivate();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stompClient = null;
    };
  }, []);

  // ------------------
  // 유틸: 화면 좌표 -> 캔버스 좌표
  // ------------------
  const calculateCursorPosition = useCallback((clientX, clientY, vp) => {
    const scaledCellSize = CELL_SIZE / vp.zoom;
    const totalCanvasWidth = CANVAS_SIZE * scaledCellSize;
    const totalCanvasHeight = CANVAS_SIZE * scaledCellSize;
    const offsetX = (window.innerWidth - totalCanvasWidth) / 2;
    const offsetY = (window.innerHeight - totalCanvasHeight) / 2;

    const x = clientX - offsetX;
    const y = clientY - offsetY;

    return {
      x: vp.x + x / scaledCellSize,
      y: vp.y + y / scaledCellSize
    };
  }, []);

  const getScreenCoords = useCallback((x, y) => {
    const scaledCellSize = CELL_SIZE / viewport.zoom;
    const totalCanvasWidth = CANVAS_SIZE * scaledCellSize;
    const totalCanvasHeight = CANVAS_SIZE * scaledCellSize;
    const offsetX = (window.innerWidth - totalCanvasWidth) / 2;
    const offsetY = (window.innerHeight - totalCanvasHeight) / 2;

    return {
      left: `${(x - viewport.x) * scaledCellSize + offsetX}px`,
      top: `${(y - viewport.y) * scaledCellSize + offsetY}px`
    };
  }, [viewport]);

  // ------------------
  // 이벤트 핸들러
  // ------------------
  // 마우스 휠 (줌)
  const handleWheel = (e) => {
    if (e.target.closest('.chat-section')) return;
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport(prev => {
      const rect = mainCanvasRef.current?.getBoundingClientRect();
      if (!rect) return prev; // 혹시 rect가 없으면 그대로 반환

      const scaledCellSize = CELL_SIZE / prev.zoom;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const pointX = mouseX / scaledCellSize + prev.x;
      const pointY = mouseY / scaledCellSize + prev.y;

      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * zoomFactor));
      const newScaledCellSize = CELL_SIZE / newZoom;
      const newX = pointX - mouseX / newScaledCellSize;
      const newY = pointY - mouseY / newScaledCellSize;

      const newViewport = {
        zoom: newZoom,
        x: Math.max(-CANVAS_SIZE * 0.1, Math.min(CANVAS_SIZE * 1.1, newX)),
        y: Math.max(-CANVAS_SIZE * 0.1, Math.min(CANVAS_SIZE * 1.1, newY)),
      };

      // 뷰포트 변경 시, 커서 위치도 갱신
      if (clientRef.current?.connected) {
        const cursorPos = calculateCursorPosition(e.clientX, e.clientY, newViewport);
        clientRef.current.publish({
          destination: '/app/cursors',
          body: JSON.stringify({
            username: usernameRef.current,
            x: cursorPos.x,
            y: cursorPos.y
          })
        });
      }

      return newViewport;
    });
  };

  // 마우스 이동
  const handleMouseMove = (e) => {
    if (!usernameRef.current || !clientRef.current) return;

    if (isDragging.current) {
      // 드래그
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      setViewport(prev => {
        const scaledCellSize = CELL_SIZE / prev.zoom;
        return {
          ...prev,
          x: prev.x - dx / scaledCellSize,
          y: prev.y - dy / scaledCellSize
        };
      });
      dragStart.current = { x: e.clientX, y: e.clientY };
    }

    // 커서 위치 전송
    if (clientRef.current?.connected) {
      const cursorPos = calculateCursorPosition(e.clientX, e.clientY, viewport);
      clientRef.current.publish({
        destination: '/app/cursors',
        body: JSON.stringify({
          username: usernameRef.current,
          x: cursorPos.x,
          y: cursorPos.y
        })
      });
    }
  };

  // 마우스 다운
  const handleMouseDown = (e) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
    // 왼쪽 버튼 + 스페이스바 -> 드래그
    if (e.button === 0 && isSpacePressed) {
      isDragging.current = true;
      mainCanvasRef.current?.classList.add('dragging');
    }
  };

  // 마우스 업
  const handleMouseUp = () => {
    if (isDragging.current) {
      isDragging.current = false;
      mainCanvasRef.current?.classList.remove('dragging');
    }
  };

  // 마우스 캔버스 영역 벗어남
  const handleMouseLeave = () => {
    if (isDragging.current) {
      isDragging.current = false;
      mainCanvasRef.current?.classList.remove('dragging');
    }
  };

  // **핵심: handleCanvasClick** - 여기서 guard문 추가
  const handleCanvasClick = async (e) => {
    // 드래그 중이거나 스페이스바 누른 경우 픽셀 클릭 무시
    if (isSpacePressed || isDragging.current) return;
    // 드래그로 인한 offset이 큰 경우 무시
    if (Math.abs(e.clientX - dragStart.current.x) > 5 ||
        Math.abs(e.clientY - dragStart.current.y) > 5) {
      return;
    }

    // ★★★★★ null 체크 가드문 ★★★★★
    if (!mainCanvasRef.current) {
      return; // canvas ref가 아직 연결되지 않았다면 함수 종료
    }

    const rect = mainCanvasRef.current.getBoundingClientRect();
    const scaledCellSize = CELL_SIZE / viewport.zoom;

    const totalCanvasWidth = CANVAS_SIZE * scaledCellSize;
    const totalCanvasHeight = CANVAS_SIZE * scaledCellSize;
    const offsetX = (window.innerWidth - totalCanvasWidth) / 2;
    const offsetY = (window.innerHeight - totalCanvasHeight) / 2;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedX = Math.floor((x - offsetX) / scaledCellSize + viewport.x);
    const clickedY = Math.floor((y - offsetY) / scaledCellSize + viewport.y);

    if (clickedX >= 0 && clickedX < CANVAS_SIZE && clickedY >= 0 && clickedY < CANVAS_SIZE) {
      const pixelDTO = { x: clickedX, y: clickedY, color: selectedColor };
      try {
        const response = await fetch('http://localhost:8080/api/pixel', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify(pixelDTO),
        });
        if (!response.ok) {
          throw new Error('픽셀 업데이트 실패');
        }

        const text = await response.text();
        if (!text) return; // 같은 색이면 서버가 빈 응답

        const updatedPixel = JSON.parse(text);
        if (updatedPixel) {
          setCanvasData(prevCanvas => {
            const newCanvas = prevCanvas.map(row => row.slice());
            newCanvas[updatedPixel.y][updatedPixel.x] = updatedPixel;
            return newCanvas;
          });

          // 픽셀 강조 표시
          setPlacedPixels(prev => [...prev, { x: updatedPixel.x, y: updatedPixel.y }]);
          setTimeout(() => {
            setPlacedPixels(prev =>
              prev.filter(p => !(p.x === updatedPixel.x && p.y === updatedPixel.y))
            );
          }, 1000);
        }
      } catch (error) {
        console.error('픽셀 업데이트 오류:', error);
      }
    }
  };

  // 채팅 메시지 전송
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

  // 채팅 스크롤
  const handleChatScroll = (e) => {
    e.stopPropagation();
  };

  // 색상 선택
  const handleColorSelect = (color) => {
    if (color === 'custom') return; // color input에서 처리
    setSelectedColor(color);
  };

  // 채팅/팔레트 토글
  const toggleChat = () => setIsChatVisible(!isChatVisible);
  const togglePalette = () => setIsPaletteVisible(!isPaletteVisible);

  // ------------------
  // 창 크기 변경 시, 캔버스 중앙 정렬
  // ------------------
  useEffect(() => {
    const handleResize = () => {
      setViewport(prev => {
        const centerX = (CANVAS_SIZE - window.innerWidth / (CELL_SIZE * prev.zoom)) / 2;
        const centerY = (CANVAS_SIZE - window.innerHeight / (CELL_SIZE * prev.zoom)) / 2;
        return { ...prev, x: centerX, y: centerY };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ------------------
  // 스페이스바
  // ------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
        document.body.style.cursor = 'grab';
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(false);
        document.body.style.cursor = 'default';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ------------------
  // 오래된 커서 정리
  // ------------------
  useEffect(() => {
    const cursorCleanupInterval = setInterval(() => {
      const now = Date.now();
      setCursors(prev => {
        const newCursors = { ...prev };
        Object.entries(newCursors).forEach(([uname, cursor]) => {
          if (now - cursor.timestamp > 5000) {
            delete newCursors[uname];
          }
        });
        return newCursors;
      });
    }, 1000);

    return () => clearInterval(cursorCleanupInterval);
  }, []);

  // ------------------
  // 최종 렌더링
  // ------------------
  return (
    <div
      className="app-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
    >
      {/* 캔버스 섹션 */}
      <CanvasSection
        canvasData={canvasData}
        viewport={viewport}
        placedPixels={placedPixels}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onCanvasClick={handleCanvasClick}
        mainCanvasRef={mainCanvasRef} // ★ 여기서 ref를 넘김
      />

      {/* 다른 사용자 커서 */}
      <CursorLayer
        cursors={cursors}
        usernameRef={usernameRef}
        viewport={viewport}
        cellSize={CELL_SIZE}
        getScreenCoords={getScreenCoords}
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

      {/* 채팅 */}
      <ChatSection
        isChatVisible={isChatVisible}
        username={usernameRef.current}
        messages={messages}
        inputMessage={inputMessage}
        onInputChange={setInputMessage}
        onSendMessage={handleSendMessage}
        onChatScroll={handleChatScroll}
      />
    </div>
  );
}

export default App;