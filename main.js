import './style.css';

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, collection, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAypRwlyhX7yoHQAmhVfB-Yx0VzqBB-iz0",
  authDomain: "webrtc-demo-64424.firebaseapp.com",
  projectId: "webrtc-demo-64424",
  storageBucket: "webrtc-demo-64424.appspot.com",
  messagingSenderId: "180760658443",
  appId: "1:180760658443:web:b48751423f293914e4fd0e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
//const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources

webcamButton.onclick = async () => {
  // AR session
  //localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(function (stream) {
      console.log("got media stream successfully: ", stream);
      localStream = stream;
      remoteStream = new MediaStream();
      // Push tracks from local stream to peer connection
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      // Pull tracks from remote stream, add to video stream
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
      };

      webcamVideo.srcObject = localStream;
      remoteVideo.srcObject = remoteStream;

      callButton.disabled = false;
      answerButton.disabled = false;
      webcamButton.disabled = true;
    })
    .catch(function (err) {
      console.log("error getting media device stream: ", err);
    });
};

// 2. Create an offer
callButton.onclick = async () => {
  const callDoc = doc(collection(db, "calls"));
  const offerCandidatesCol = collection(callDoc, 'offerCandidates');
  const offerCandidatesDoc = doc(collection(callDoc, 'offerCandidates'));
  const answerCandidatesCol = collection(callDoc, 'answerCandidates');
  const answerCandidatesDoc = doc(collection(callDoc, 'answerCandidates'));

  console.log("success");
  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = async (event) => {
    event.candidate && await setDoc(offerCandidatesDoc, event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // await callDoc.set({ offer });
  await setDoc(callDoc, { offer });

  // Listen for remote answer
  onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  onSnapshot(answerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') { // triggers only when a new document is added to the collection
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  //hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = doc(db, "calls", callId);
  const offerCandidatesCol = collection(callDoc, 'offerCandidates');
  const offerCandidatesDoc = doc(collection(callDoc, 'offerCandidates'));
  const answerCandidatesCol = collection(callDoc, 'answerCandidates');
  const answerCandidatesDoc = doc(collection(callDoc, 'answerCandidates'));

  pc.onicecandidate = async (event) => {
    event.candidate && await setDoc(answerCandidatesDoc, event.candidate.toJSON());
  };

  const callDataSnap = await getDoc(callDoc);
  let callData;

  if (callDataSnap.exists()) {
    console.log("Document data:", callDataSnap.data());
    callData = callDataSnap.data();
  } else {
    console.log("No such document!");
  }

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDoc, { answer });

  onSnapshot(offerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};