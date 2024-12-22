import React, { useState, useEffect, useRef, useCallback } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { getRandomNickname } from '@woowa-babble/random-nickname';
import './App.css';

const COLOR_PALETTE = [
  '#000000', '#666666', '#0000ff', '#00ff00',
  '#ff0000', '#ffff00', '#ffa500', '#800080',
  '#ffffff', '#333333', '#00ffff', '#008000',
  '#ff69b4', '#ffd700', '#ff4500', 'custom'
];

// SVG 아이콘 컴포넌트
const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
  </svg>
);

const ChatCloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
  </svg>
);

// 사용자 아이콘 컴포넌트
const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
  </svg>
);

// 팔레트 토글 아이콘 추가
const PaletteToggleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
  </svg>
);

// 랜덤 색상 생성 함수
const generateRandomColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 50%)`;
};

function App() {
  const CANVAS_SIZE = 256; // 캔버스 크기
  const CELL_SIZE = 16; // 셀 크기 
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

  const mainCanvasRef = useRef(null);
  const chatContainerRef = useRef(null);
  const clientRef = useRef(null);

  // 커서 관련
  const [cursors, setCursors] = useState({});
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const type = 'animals'; // animals, heroes, characters, monsters

  // WebSocket 관련 상수 추가
  const RECONNECT_DELAY = 5000;
  const MAX_RECONNECT_ATTEMPTS = 5;

  // 스페이스바 상태 추가
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Pixel Placement Indicator State
  const [placedPixels, setPlacedPixels] = useState([]);

  // 초기 데이터 가져오기
  const fetchCanvasData = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/canvas', {
        headers: { 'Cache-Control': 'no-cache' },
      });
  
      if (!response.ok) {
        throw new Error('캔버스 데이터 가져오기 실패');
      }
  
      const pixels = await response.json();
  
      // 초기 2차원 배열 생성
      const initialCanvas = Array.from({ length: CANVAS_SIZE }, (_, y) =>
        Array.from({ length: CANVAS_SIZE }, (_, x) => ({
          x,
          y,
          color: '#FFFFFF', // 기본 색상은 흰색
        }))
      );
  
      // 서버에서 받은 픽셀 데이터 적용
      pixels.forEach(pixel => {
        if (
          pixel &&
          pixel.x >= 0 &&
          pixel.x < CANVAS_SIZE &&
          pixel.y >= 0 &&
          pixel.y < CANVAS_SIZE
        ) {
          initialCanvas[pixel.y][pixel.x] = {
            x: pixel.x,
            y: pixel.y,
            color: pixel.color,
          };
        }
      });
  
      // 상태 업데이트
      setCanvasData(initialCanvas);
    } catch (error) {
      console.error('캔버스 데이터 가져오기 오류:', error);
    }
  };
  
  useEffect(() => {
    fetchCanvasData();
    
    // localStorage에서 닉네임 확인 또는 새로 생성
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
      usernameRef.current = savedUsername;
    } else {
      const newUsername = getRandomNickname(type);
      usernameRef.current = newUsername;
      localStorage.setItem('username', newUsername);
    }

    // 화면 크기에 맞춰 초기 줌 레벨 계산
    const windowAspect = window.innerWidth / window.innerHeight;
    const canvasAspect = CANVAS_SIZE / CANVAS_SIZE;
    
    let initialZoom;
    if (windowAspect > canvasAspect) {
      // 화면이 더 넓은 경우 높이에 맞춤
      initialZoom = window.innerHeight / (CANVAS_SIZE * CELL_SIZE);
    } else {
      // 화면이 더 좁은 경우 너비에 맞춤
      initialZoom = window.innerWidth / (CANVAS_SIZE * CELL_SIZE);
    }

    // 여유 공간을 위해 약간 줄임
    initialZoom *= 0.9;
    
    // 줌 범위 제한 적용
    initialZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialZoom));

    // 중앙 정렬을 위한 위치 계산
    const centerX = (CANVAS_SIZE - window.innerWidth / (CELL_SIZE * initialZoom)) / 2;
    const centerY = (CANVAS_SIZE - window.innerHeight / (CELL_SIZE * initialZoom)) / 2;

    setViewport({
      x: centerX,
      y: centerY,
      zoom: initialZoom
    });
  }, []);

  // WebSocket 설정 부분 수정
  useEffect(() => {
    let stompClient = null;
    let subscriptions = new Set();
    let reconnectAttempts = 0;
    let reconnectTimeout = null;

    const connect = () => {
      if (stompClient?.connected) {
        console.log('이미 연결되어 있습니다.');
        return;
      }

      try {
        stompClient = new Client({
          webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
          reconnectDelay: 0, // 자체 재연결 로직 사용
          onConnect: () => {
            console.log('WebSocket 연결 성공');
            reconnectAttempts = 0; // 연결 성공시 카운트 리셋

            // 기존 구독 해제
            subscriptions.forEach(sub => sub?.unsubscribe());
            subscriptions.clear();

            // 새로운 구독 설정
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
        console.error('WebSocket 연결 시도 중 오류:', error);
        handleDisconnect();
      }
    };

    const handleDisconnect = () => {
      clientRef.current = null;

      // 재연결 시도
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

    // 메시지 핸들러 함수들
    const handleCanvasMessage = (message) => {
      try {
        const pixelData = JSON.parse(message.body);
        console.log('WebSocket으로 받은 픽셀 데이터:', pixelData);
        
        if (pixelData && typeof pixelData.x === 'number' && 
            typeof pixelData.y === 'number' && pixelData.color) {
          setCanvasData(prevCanvas => {
            const newCanvas = prevCanvas.map(row => row.slice());
            newCanvas[pixelData.y][pixelData.x] = {
              x: pixelData.x,
              y: pixelData.y,
              color: pixelData.color
            };
            return newCanvas;
          });
        }
      } catch (error) {
        console.error('캔버스 메시지 처리 중 오류:', error);
      }
    };

    const handleChatMessage = (message) => {
      try {
        const chatMessage = JSON.parse(message.body);
        setMessages(prev => { 
          const isDuplicate = prev.some(msg => 
            msg.sender === chatMessage.sender && 
            msg.content === chatMessage.content &&
            Math.abs(new Date(msg.timestamp) - new Date(chatMessage.timestamp)) < 1000
          );

          if (isDuplicate) return prev;
          
          const newMessages = [...prev, chatMessage];
          
          // 새 메시지가 오면 자동 스크롤
          setTimeout(() => {
            if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
          }, 0);
          
          return newMessages;
        });
      } catch (error) {
        console.error('채팅 메시지 처리 중 오류:', error);
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
            timestamp: Date.now() // 타임스탬프 추가
          }
        }));
      } catch (error) {
        console.error('커서 메시지 처리 중 오류:', error);
      }
    };

    const handleCursorRemoveMessage = (message) => {
      try {
        const removedUsername = JSON.parse(message.body);
        console.log(`사용자 커서 제거: ${removedUsername.username}`);
        setCursors(prev => {
          const newCursors = { ...prev };
          delete newCursors[removedUsername.username];
          return newCursors;
        });
      } catch (error) {
        console.error('커서 제거 메시지 처리 중 오류:', error);
      }
    };

    // 초기 연결 시작
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

    // 정리 함수
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

  // 화면 크기에 맞춰 화면 좌표를 캔버스 좌표로 변환하는 함수
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
  }, [viewport.zoom, viewport.x, viewport.y]);

  // renderCanvas 함수를 useCallback으로 메모이제이션
  const renderCanvas = useCallback(() => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return;

    const context = mainCanvas.getContext('2d');
    if (!context) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    
    if (mainCanvas.width !== width || mainCanvas.height !== height) {
      mainCanvas.width = width;
      mainCanvas.height = height;
    }

    // 전체 화면을 검은색으로 채우기
    context.fillStyle = '#1a1a1a';
    context.fillRect(0, 0, width, height);

    const scaledCellSize = CELL_SIZE / viewport.zoom;
    const totalCanvasWidth = CANVAS_SIZE * scaledCellSize;
    const totalCanvasHeight = CANVAS_SIZE * scaledCellSize;
    const offsetX = (width - totalCanvasWidth) / 2;
    const offsetY = (height - totalCanvasHeight) / 2;

    // 모든 픽셀을 렌더링 (빈 픽셀은 흰색으로)
    for (let y = 0; y < CANVAS_SIZE; y++) {
      for (let x = 0; x < CANVAS_SIZE; x++) {
        const renderX = Math.floor(offsetX + (x - viewport.x) * scaledCellSize);
        const renderY = Math.floor(offsetY + (y - viewport.y) * scaledCellSize);
        const renderSize = Math.max(1, Math.ceil(scaledCellSize));

        const pixel = canvasData[y]?.[x];
        context.fillStyle = pixel?.color || '#ffffff';
        context.fillRect(renderX, renderY, renderSize, renderSize);
      }
    }

    // Draw pixel placement indicators
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    context.lineWidth = 2;
    placedPixels.forEach(pixel => {
      const renderX = Math.floor(offsetX + (pixel.x - viewport.x) * scaledCellSize);
      const renderY = Math.floor(offsetY + (pixel.y - viewport.y) * scaledCellSize);
      const renderSize = Math.max(1, Math.ceil(scaledCellSize));

      context.strokeRect(renderX, renderY, renderSize, renderSize);
    });
  }, [canvasData, viewport, placedPixels]);

  // viewport나 canvasData, placedPixels가 변경될 때마다 캔버스 업데이트
  useEffect(() => {
    requestAnimationFrame(renderCanvas);
  }, [viewport, canvasData, placedPixels, renderCanvas]);

  // 커서 위치 계산 함수를 분리
  const calculateCursorPosition = (clientX, clientY, viewport) => {
    const scaledCellSize = CELL_SIZE / viewport.zoom;
    const totalCanvasWidth = CANVAS_SIZE * scaledCellSize;
    const totalCanvasHeight = CANVAS_SIZE * scaledCellSize;
    const offsetXCanvas = (window.innerWidth - totalCanvasWidth) / 2;
    const offsetYCanvas = (window.innerHeight - totalCanvasHeight) / 2;

    const x = clientX - offsetXCanvas;
    const y = clientY - offsetYCanvas;

    return {
      x: viewport.x + x / scaledCellSize,
      y: viewport.y + y / scaledCellSize
    };
  };

  // handleWheel 함수 수정
  const handleWheel = (e) => {
    if (e.target.closest('.chat-section')) return;
    
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    
    setViewport((prev) => {
      const rect = mainCanvasRef.current.getBoundingClientRect();
      const scaledCellSize = CELL_SIZE / prev.zoom;
      
      // 마우스 위치를 캔버스 상의 좌표로 변환
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // 마우스 위치의 캔버스 좌표 계산
      const pointX = mouseX / scaledCellSize + prev.x;
      const pointY = mouseY / scaledCellSize + prev.y;
      
      // 새로운 줌 레벨
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * zoomFactor));
      const newScaledCellSize = CELL_SIZE / newZoom;
      
      // 새로운 뷰포트 위치 계산
      const newX = pointX - mouseX / newScaledCellSize;
      const newY = pointY - mouseY / newScaledCellSize;

      const newViewport = {
        zoom: newZoom,
        x: Math.max(-CANVAS_SIZE * 0.1, Math.min(CANVAS_SIZE * 1.1, newX)),
        y: Math.max(-CANVAS_SIZE * 0.1, Math.min(CANVAS_SIZE * 1.1, newY))
      };

      // 새로운 뷰포트로 커서 위치 업데이트
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

  // handleMouseMove 함수도 수정
  const handleMouseMove = (e) => {
    if (!usernameRef.current || !clientRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 드래그 처리
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      
      setViewport((prev) => {
        const scaledCellSize = CELL_SIZE / prev.zoom;
        const moveX = dx / scaledCellSize;
        const moveY = dy / scaledCellSize;

        return {
          ...prev,
          x: prev.x - moveX,
          y: prev.y - moveY
        };
      });

      dragStart.current = { x: e.clientX, y: e.clientY };
    }

    // 커서 위치 업데이트에 분리된 함수 사용
    const cursorPos = calculateCursorPosition(e.clientX, e.clientY, viewport);
    clientRef.current.publish({
      destination: '/app/cursors',
      body: JSON.stringify({
        username: usernameRef.current,
        x: cursorPos.x,
        y: cursorPos.y
      })
    });
  };

  // handleMouseDown 함수 수정
  const handleMouseDown = (e) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
    
    if (e.button === 0 && isSpacePressed) { // 스페이스바가 눌린 상태에서만 드래그
      isDragging.current = true;
      // 'dragging' 클래스를 main-canvas에 적용
      mainCanvasRef.current.classList.add('dragging');
    }
  };

  // handleMouseUp 함수 수정
  const handleMouseUp = (e) => {
    if (isDragging.current) {
      isDragging.current = false;
      // 'dragging' 클래스를 main-canvas에서 제거
      mainCanvasRef.current.classList.remove('dragging');
    }
  };

  // handleMouseLeave 함수 수정
  const handleMouseLeave = (e) => {
    if (isDragging.current) {
      isDragging.current = false;
      // 'dragging' 클래스를 main-canvas에서 제거
      mainCanvasRef.current.classList.remove('dragging');
    }
  };

  const toggleChat = () => setIsChatVisible(!isChatVisible);

  // handleCanvasClick 함수 수정
  const handleCanvasClick = async (e) => {
    if (isSpacePressed || isDragging.current) return;
    
    if (Math.abs(e.clientX - dragStart.current.x) > 5 || 
        Math.abs(e.clientY - dragStart.current.y) > 5) return;

    const canvas = mainCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
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
      const pixelDTO = { 
        x: clickedX, 
        y: clickedY, 
        color: selectedColor
      };
      
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
        if (!text) return; // 같은 색상인 경우

        const updatedPixel = JSON.parse(text);
        if (updatedPixel) {
          setCanvasData(prevCanvas => {
            const newCanvas = prevCanvas.map(row => row.slice());
            newCanvas[updatedPixel.y][updatedPixel.x] = updatedPixel;
            return newCanvas;
          });

          // Add to placedPixels for indicator
          setPlacedPixels(prev => [...prev, { x: updatedPixel.x, y: updatedPixel.y }]);

          // Remove the indicator after 1 second
          setTimeout(() => {
            setPlacedPixels(prev => prev.filter(p => !(p.x === updatedPixel.x && p.y === updatedPixel.y)));
          }, 1000);
        }
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
    
    console.log('메시지 전송 도:', message);
    
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: '/app/chat/send',
        body: JSON.stringify(message),
      });
      console.log('메시지 전송 완료');
      setInputMessage('');
    }
  };

  // 캔버스 크기 설정을 위한 함수 추가
  const updateCanvasSize = () => {
    if (mainCanvasRef.current) {
      const canvas = mainCanvasRef.current;
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

  // 채팅창 스크롤 이벤트 처리
  const handleChatScroll = (e) => {
    e.stopPropagation(); // 이벤트 전파 중단
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

  // 창 기본 변경 시 캔버스 중앙 정렬
  useEffect(() => {
    const handleResize = () => {
      setViewport(prev => {
        const centerX = (CANVAS_SIZE - window.innerWidth / (CELL_SIZE * prev.zoom)) / 2;
        const centerY = (CANVAS_SIZE - window.innerHeight / (CELL_SIZE * prev.zoom)) / 2;
        
        return {
          ...prev,
          x: centerX,
          y: centerY
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 키보드 이벤트 핸들러 추가
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

  // 커서 정리를 위한 useEffect 추가
  useEffect(() => {
    const cursorCleanupInterval = setInterval(() => {
      const now = Date.now();
      setCursors(prev => {
        const newCursors = { ...prev };
        Object.entries(newCursors).forEach(([username, cursor]) => {
          if (now - cursor.timestamp > 5000) { // 5초 이상 업데이트 없으면 제거
            delete newCursors[username];
          }
        });
        return newCursors;
      });
    }, 1000);

    return () => clearInterval(cursorCleanupInterval);
  }, []);

  return (
    <div
      className="app-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
    >
      <canvas
        ref={mainCanvasRef}
        className="main-canvas"
        onClick={handleCanvasClick}
        data-space-pressed={isSpacePressed}
      />
      {/* 다른 사용자들의 커서 렌더링 */}
      {Object.entries(cursors).map(([cursorUsername, position]) => (
        usernameRef.current !== cursorUsername && (
          <div
            key={cursorUsername}
            className="cursor"
            style={getScreenCoords(position.x, position.y)}
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

      <div 
        className={`chat-section ${!isChatVisible ? 'hidden' : ''}`}
        onWheel={handleChatScroll} // 채팅 스크롤 이벤트 처리 추가
      >
        <div className="chat-header">
          <div className="username-display">
            <UserIcon />
            <span>{usernameRef.current}</span>
          </div>
        </div>
        <div className="chat-messages" ref={chatContainerRef}>
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.sender === usernameRef.current ? 'own-message' : ''}`}
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
          <form onSubmit={handleSendMessage}>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="메시지를 입력��세요"
              maxLength={200}
            />
            <button type="submit">전송</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
