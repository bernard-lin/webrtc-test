let isChannelReady = false;
let isInitiator = false;
let isStarted = false;
let localStream;
let pc;
let remoteStream;
let turnReady;

let pcConfig = {
  'iceServers': [{
    'url': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
let sdpConstraints = {
  'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true
  }
};

/////////////////////////////////////////////

let room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

let socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', room => {
  console.log(`Created room ${room}`);
  isInitiator = true;
});

socket.on('full', room => {
  console.log(`Room ${room} is full`);
});

socket.on('join', room => {
  console.log(`Another peer made a request to join room ${room}`);
  console.log(`This peer is the initiator of room ${room}!`);
  isChannelReady = true;
});

socket.on('joined', room => {
  console.log(`joined: ${room}`);
  isChannelReady = true;
});

socket.on('log', array => {
  console.log(...array);
});

////////////////////////////////////////////////

let sendMessage = (message) => {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', message => {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    let candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

let localVideo = document.querySelector('#localVideo');
let remoteVideo = document.querySelector('#remoteVideo');

let gotStream = (stream) => {
  console.log('Adding local stream.');
  localVideo.src = window.URL.createObjectURL(stream);
  localStream = stream;
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
}

navigator.mediaDevices.getUserMedia({
  audio: true,
  video: true
})
.then(gotStream)
.catch(e => {
  alert(`getUserMedia() error: ${e.name}`);
});



let constraints = {
  video: true
};

console.log('Getting user media with constraints', constraints);

// if (location.hostname !== 'localhost') {
//   requestTurn(
//     'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
//   );
// }

let maybeStart = () => {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = () => {
  sendMessage('bye');
};

/////////////////////////////////////////////////////////

let createPeerConnection = () => {
  try {
    pc = new RTCPeerConnection(pcConfig);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log(`Failed to create PeerConnection, exception: ${e.message}`);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

 let handleIceCandidate = (event) => {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

let handleRemoteStreamAdded = (event) => {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteStream = event.stream;
}

let handleCreateOfferError = (event) => {
  console.log('createOffer() error: ', event);
}

let doCall = () => {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

let doAnswer = () => {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

let setLocalAndSendMessage = (sessionDescription) => {
  // Set Opus as the preferred codec in SDP if Opus is present.
  //  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

let onCreateSessionDescriptionError = (error) => {
  trace(`Failed to create session description: ${error.toString()}`);
}

// let requestTurn = (turnURL) => {
//   let turnExists = false;
//   for (let i in pcConfig.iceServers) {
//     if (pcConfig.iceServers[i].url.substr(0, 5) === 'turn:') {
//       turnExists = true;
//       turnReady = true;
//       break;
//     }
//   }
//   if (!turnExists) {
//     console.log('Getting TURN server from ', turnURL);
//     // No TURN server. Get one from computeengineondemand.appspot.com:
//     let xhr = new XMLHttpRequest();
//
//   }
// }



let handleRemoteStreamRemoved = (event) => {
  console.log('Remote stream removed. Event: ', event);
}

let hangup = () => {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

let handleRemoteHangup = () => {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

let stop = () => {
  isStarted = false;
  // isAudioMuted = false;
  // isVideoMuted = false;
  pc.close();
  pc = null;
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
let  preferOpus = (sdp) => {
  let sdpLines = sdp.split('\r\n');
  let mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('m=audio') !== -1) {
      mLineIndex = i;
      break;
    }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      let opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
          opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

let extractSdp = (sdpLine, pattern) => {
  let result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
let setDefaultCodec = (mLine, payload) => {
  let elements = mLine.split(' ');
  let newLine = [];
  let index = 0;
  for (let i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
let removeCN = (sdpLines, mLineIndex) => {
  let mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (let i = sdpLines.length - 1; i >= 0; i--) {
    let payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      let cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}
