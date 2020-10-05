/* global navigator */
// @flow
import type { Message } from 'sip.js/lib/api/message';
import type { Session } from 'sip.js/lib/core/session';
import { Invitation } from 'sip.js/lib/api/invitation';
import { SessionState } from 'sip.js/lib/api/session-state';

import CallSession from '../CallSession';
import type { Phone, AvailablePhoneOptions } from './Phone';
import WazoWebRTCClient from '../../web-rtc-client';
import Emitter from '../../utils/Emitter';
import IssueReporter from '../../service/IssueReporter';

export const ON_USER_AGENT = 'onUserAgent';
export const ON_REGISTERED = 'onRegistered';
export const ON_UNREGISTERED = 'onUnRegistered';
export const ON_PROGRESS = 'onProgress';
export const ON_CALL_ACCEPTED = 'onCallAccepted';
export const ON_CALL_ANSWERED = 'onCallAnswered';
export const ON_CALL_INCOMING = 'onCallIncoming';
export const ON_CALL_OUTGOING = 'onCallOutgoing';
export const ON_CALL_MUTED = 'onCallMuted';
export const ON_CALL_UNMUTED = 'onCallUnmuted';
export const ON_CALL_RESUMED = 'onCallResumed';
export const ON_CALL_HELD = 'onCallHeld';
export const ON_CALL_UNHELD = 'onCallUnHeld';
export const ON_CAMERA_DISABLED = 'onCameraDisabled';
export const ON_CAMERA_RESUMED = 'onCameraResumed';
export const ON_CALL_FAILED = 'onCallFailed';
export const ON_CALL_ENDED = 'onCallEnded';
export const ON_MESSAGE = 'onMessage';
export const ON_REINVITE = 'reinvite';
export const ON_TRACK = 'onTrack';
export const ON_AUDIO_STREAM = 'onAudioStream';
export const ON_VIDEO_STREAM = 'onVideoStream';
export const ON_REMOVE_STREAM = 'onRemoveStream';
export const ON_SHARE_SCREEN_STARTED = 'onScreenShareStarted';
export const ON_SHARE_SCREEN_ENDING = 'onScreenShareEnding';
export const ON_SHARE_SCREEN_ENDED = 'onScreenShareEnded';
export const ON_TERMINATE_SOUND = 'terminateSound';
export const ON_PLAY_RING_SOUND = 'playRingingSound';
export const ON_PLAY_INBOUND_CALL_SIGNAL_SOUND = 'playInboundCallSignalSound';
export const ON_PLAY_HANGUP_SOUND = 'playHangupSound';
export const ON_PLAY_PROGRESS_SOUND = 'playProgressSound';
export const ON_VIDEO_INPUT_CHANGE = 'videoInputChange';

export const events = [
  ON_USER_AGENT,
  ON_REGISTERED,
  ON_UNREGISTERED,
  ON_PROGRESS,
  ON_CALL_ACCEPTED,
  ON_CALL_ANSWERED,
  ON_CALL_INCOMING,
  ON_CALL_OUTGOING,
  ON_CALL_MUTED,
  ON_CALL_UNMUTED,
  ON_CALL_RESUMED,
  ON_CALL_HELD,
  ON_CALL_UNHELD,
  ON_CAMERA_DISABLED,
  ON_CALL_FAILED,
  ON_CALL_ENDED,
  ON_MESSAGE,
  ON_REINVITE,
  ON_TRACK,
  ON_AUDIO_STREAM,
  ON_VIDEO_STREAM,
  ON_REMOVE_STREAM,
  ON_SHARE_SCREEN_ENDED,
  ON_TERMINATE_SOUND,
  ON_PLAY_RING_SOUND,
  ON_PLAY_INBOUND_CALL_SIGNAL_SOUND,
  ON_PLAY_HANGUP_SOUND,
  ON_PLAY_PROGRESS_SOUND,
  ON_VIDEO_INPUT_CHANGE,
];

export default class WebRTCPhone extends Emitter implements Phone {
  client: WazoWebRTCClient;

  allowVideo: boolean;

  sipSessions: { [string]: Session };

  callSessions: { [string]: CallSession };

  incomingSessions: string[];

  currentSipSession: Session;

  currentCallSession: ?CallSession;

  audioOutputDeviceId: ?string;

  audioRingDeviceId: ?string;

  audioOutputVolume: number;

  audioRingVolume: number;

  ringingEnabled: boolean;

  acceptedSessions: Object;

  rejectedSessions: Object;

  ignoredSessions: Object;

  currentScreenShare: Object;

  shouldSendReinvite: boolean;

  constructor(
    client: WazoWebRTCClient,
    audioOutputDeviceId: ?string,
    allowVideo: boolean = false,
    audioRingDeviceId?: string,
  ) {
    super();

    this.client = client;
    this.allowVideo = allowVideo;
    this.sipSessions = {};
    this.callSessions = {};
    this.audioOutputDeviceId = audioOutputDeviceId;
    this.audioRingDeviceId = audioRingDeviceId || audioOutputDeviceId;
    this.audioOutputVolume = 1;
    this.audioRingVolume = 1;
    this.incomingSessions = [];
    this.ringingEnabled = true;
    this.shouldSendReinvite = false;

    this.bindClientEvents();

    this.acceptedSessions = {};
    this.rejectedSessions = {};
    this.ignoredSessions = {};
  }

  register() {
    if (!this.client) {
      return Promise.resolve();
    }

    return this.client.register().then(() => {
      return this.bindClientEvents();
    }).catch(error => {
      // Avoid exception on `t.server.scheme` in sip transport when losing the webrtc socket connection
      console.error('[WebRtcPhone] register error', error, error.message, error.stack);
      IssueReporter.log(IssueReporter.ERROR, `[WebRtcPhone] register error ${error.message}, ${error.stack}`);
    });
  }

  unregister() {
    if (!this.client || !this.client.isRegistered()) {
      return null;
    }
    return this.client.unregister();
  }

  stop() {
    if (!this.client) {
      return;
    }
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] stop');
    this.client.stop();
  }

  removeIncomingSessions(id: string) {
    this.incomingSessions = this.incomingSessions.filter(sessionId => sessionId !== id);
  }

  isWebRTC() {
    return true;
  }

  sendReinvite(sipSession: Session, newConstraints: Object = null) {
    if (!sipSession) {
      return;
    }

    return this.client.reinvite(sipSession, newConstraints);
  }

  getUserAgent() {
    return (this.client && this.client.config && this.client.config.userAgentString) || 'webrtc-phone';
  }

  startHeartbeat() {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] startHeartbeat', !!this.client, this.client.hasHeartbeat());
    if (!this.client || this.client.hasHeartbeat()) {
      return;
    }

    this.client.startHeartbeat();
  }

  stopHeartbeat() {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] stopHeartbeat', !!this.client);
    if (!this.client) {
      return;
    }

    this.client.stopHeartbeat();
  }

  setOnHeartbeatTimeout(cb: Function) {
    this.client.setOnHeartbeatTimeout(cb);
  }

  setOnHeartbeatCallback(cb: Function) {
    this.client.setOnHeartbeatCallback(cb);
  }

  reconnect() {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] reconnect', !!this.client);
    if (!this.client) {
      return;
    }
    this.client.attemptReconnection();
  }

  getOptions(): AvailablePhoneOptions {
    return {
      accept: true,
      decline: true,
      mute: true,
      hold: true,
      transfer: true,
      sendKey: true,
      addParticipant: false,
      record: true,
      merge: true,
    };
  }

  _bindEvents(sipSession: Session) {
    sipSession.stateChange.addListener((newState: SessionState) => {
      switch (newState) {
        case SessionState.Establishing:
          if (sipSession instanceof Invitation) {
            // No need to trigger progress for an invitation (eg: when we answer the call).
            return;
          }
          // When receiving a progress event, we know we are the caller so we have to force incoming to false
          return this.eventEmitter.emit(
            ON_PROGRESS,
            this._createCallSession(sipSession, null, { incoming: false, ringing: true }),
            this.audioOutputDeviceId,
            this.audioOutputVolume,
          );
        case SessionState.Terminated:
          IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] Terminated', sipSession.id);
          this._onCallTerminated(sipSession);

          return this.eventEmitter.emit(ON_CALL_ENDED, this._createCallSession(sipSession));
        default:
          break;
      }
    });

    if (!sipSession.sessionDescriptionHandler) {
      return;
    }

    // Video events
    const { peerConnection } = sipSession.sessionDescriptionHandler;
    peerConnection.ontrack = rawEvent => {
      const event = rawEvent;
      const [stream] = event.streams;

      if (event.track.kind === 'audio') {
        return this.eventEmitter.emit(ON_AUDIO_STREAM, stream);
      }

      // not sure this does anything
      if (event.track.kind === 'video') {
        event.track.enabled = false;
      }

      return this.eventEmitter.emit(ON_VIDEO_STREAM, stream, event.track.id, event);
    };

    peerConnection.onremovestream = event => {
      this.eventEmitter.emit(ON_REMOVE_STREAM, event.stream);
    };
  }

  async startScreenSharing(constraintsOrStream: ?Object | MediaStream, callSession?: CallSession) {
    if (!navigator.mediaDevices) {
      return null;
    }

    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] stopScreenSharing', constraintsOrStream,
      callSession ? callSession.getId() : null);

    let screenShareStream = constraintsOrStream;
    let constraints = null;

    if (!constraintsOrStream || !(constraintsOrStream instanceof MediaStream)) {
      try {
        constraints = constraintsOrStream || { video: { cursor: 'always' }, audio: false };
        // $FlowFixMe
        screenShareStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      } catch (e) {
        console.warn(e);
        return null;
      }
    }

    // $FlowFixMe
    screenShareStream.local = true;

    if (!screenShareStream) {
      throw new Error(`Can't create media stream for screensharing with contraints ${JSON.stringify(constraints)}`);
    }

    const screenTrack = screenShareStream.getVideoTracks()[0];
    const sipSession = this.currentSipSession;
    const pc = sipSession.sessionDescriptionHandler.peerConnection;
    const sender = pc.getSenders().find(s => s.track.kind === 'video');
    const localStream = this.client.getLocalStream(pc);

    if (sender) {
      sender.replaceTrack(screenTrack);
    }

    screenTrack.onended = () => this.eventEmitter.emit(
      ON_SHARE_SCREEN_ENDING,
      this._createCallSession(sipSession, callSession),
    );
    this.currentScreenShare = { stream: screenShareStream, sender, localStream };

    this.eventEmitter.emit(
      ON_SHARE_SCREEN_STARTED,
      this._createCallSession(sipSession, callSession, { screensharing: true }),
    );

    return screenShareStream;
  }

  async stopScreenSharing(restoreLocalStream: boolean = true, callSession?: CallSession) {
    if (!this.currentScreenShare) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] stopScreenSharing');

    try {
      if (this.currentScreenShare.stream) {
        await this.currentScreenShare.stream.getVideoTracks().forEach(track => track.stop());
      }

      if (restoreLocalStream) {
        if (this.currentScreenShare.sender) {
          await this.currentScreenShare.sender.replaceTrack(this.currentScreenShare.localStream.getVideoTracks()[0]);
        }
      } else if (this.currentScreenShare.localStream) {
        await this.currentScreenShare.localStream.getVideoTracks().forEach(track => track.stop());
      }
    } catch (e) {
      console.warn(e);
    }

    const sipSession = this.currentSipSession;

    this.eventEmitter.emit(
      ON_SHARE_SCREEN_ENDED,
      callSession ? this._createCallSession(sipSession, callSession, { screensharing: false }) : null,
    );

    this.currentScreenShare = null;
  }

  _onCallAccepted(sipSession: Session, cameraEnabled: boolean): CallSession {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] onCallAccepted', sipSession.id, cameraEnabled);

    const callSession = this._createAcceptedCallSession(sipSession, cameraEnabled);
    this.sipSessions[callSession.getId()] = sipSession;
    this.currentSipSession = sipSession;
    this.currentCallSession = callSession;

    this.eventEmitter.emit(ON_TERMINATE_SOUND);
    const sipSessionId = this.client.getSipSessionId(sipSession);
    if (sipSessionId) {
      this.removeIncomingSessions(sipSessionId);
    }

    this.eventEmitter.emit(ON_CALL_ACCEPTED, callSession, cameraEnabled);

    return callSession;
  }

  changeAudioDevice(id: string) {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] changeAudioDevice', id);
    this.audioOutputDeviceId = id;
    this.client.changeAudioOutputDevice(id);
  }

  changeRingDevice(id: string) {
    this.audioRingDeviceId = id;
  }

  // volume is a value between 0 and 1
  changeAudioVolume(volume: number) {
    this.audioOutputVolume = volume;
    this.client.changeAudioOutputVolume(volume);
  }

  // volume is a value between 0 and 1
  changeRingVolume(volume: number) {
    this.audioRingVolume = volume;
  }

  changeAudioInputDevice(id: string) {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] changeAudioInputDevice', id);

    return this.client.changeAudioInputDevice(id, this.currentSipSession);
  }

  changeVideoInputDevice(id: string) {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] changeVideoInputDevice', id);

    return this.client.changeVideoInputDevice(id, this.currentSipSession);
  }

  _onCallTerminated(sipSession: Session) {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] _onCallTerminated', sipSession.id);

    const callSession = this._createCallSession(sipSession);

    this.eventEmitter.emit(ON_TERMINATE_SOUND);

    const sipSessionId = this.client.getSipSessionId(sipSession);
    if (sipSessionId) {
      this.removeIncomingSessions(sipSessionId);
    }

    delete this.sipSessions[callSession.getId()];
    delete this.callSessions[callSession.getId()];

    if (this.isCurrentCallSipSession(callSession)) {
      this.currentSipSession = undefined;
      this.currentCallSession = undefined;
    }

    if (callSession.getId() in this.ignoredSessions) {
      return;
    }

    this.eventEmitter.emit(ON_PLAY_HANGUP_SOUND, this.audioOutputDeviceId, this.audioOutputVolume);
  }

  setActiveSipSession(callSession: CallSession) {
    const sipSessionId = this.findSipSession(callSession);
    if (!sipSessionId) {
      return;
    }

    this.currentSipSession = sipSessionId;
    this.currentCallSession = callSession;
  }

  hasAnActiveCall() {
    return !!this.currentSipSession;
  }

  // /!\ In some case with react0native webrtc the session will have only one audio stream set
  // Maybe due to https://github.com/react-native-webrtc/react-native-webrtc/issues/401
  // Better check directly `peerConnection.getRemoteStreams()` when on mobile rather than client.videoSessions.
  hasActiveRemoteVideoStream() {
    const sipSession = this.currentSipSession;
    if (!sipSession) {
      return false;
    }

    const { peerConnection } = sipSession.sessionDescriptionHandler;
    const remoteStream = peerConnection.getRemoteStreams().find(stream => !!stream.getVideoTracks().length);

    return remoteStream && remoteStream.getVideoTracks().some(track => !track.muted);
  }

  callCount() {
    return Object.keys(this.sipSessions).length;
  }

  isCurrentCallSipSession(callSession: CallSession): boolean {
    if (!this.currentSipSession) {
      return false;
    }

    return this.currentSipSession && this.client.getSipSessionId(this.currentSipSession) === callSession.getId();
  }

  isCallUsingVideo(callSession: CallSession): boolean {
    return this.client.sessionHasVideo(callSession.getId());
  }

  getLocalStreamForCall(callSession: CallSession): boolean {
    if (!callSession) {
      return false;
    }
    return this.client.videoSessions[callSession.getId()]
      && this.client.videoSessions[callSession.getId()].local;
  }

  getRemoteStreamForCall(callSession: CallSession): boolean {
    if (!callSession) {
      return false;
    }

    const remotes = this.client.videoSessions[callSession.getId()]
      && this.client.videoSessions[callSession.getId()].remotes;

    if (!remotes) {
      return false;
    }

    return remotes && remotes[remotes.length - 1];
  }

  getRemoteStreamsForCall(callSession: CallSession): Object[] {
    if (!callSession) {
      return [];
    }

    const sipSession = this.sipSessions[callSession.getId()];
    if (!sipSession || !sipSession.sessionDescriptionHandler) {
      return [];
    }

    const { peerConnection } = sipSession.sessionDescriptionHandler;
    return peerConnection.getRemoteStreams();
  }

  accept(callSession: CallSession, cameraEnabled?: boolean): Promise<string | null> {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] accept', callSession.getId(), cameraEnabled);
    if (this.currentSipSession) {
      this.holdSipSession(this.currentSipSession, callSession, true);
    }

    if (!callSession || callSession.getId() in this.acceptedSessions) {
      return Promise.resolve(null);
    }

    this.shouldSendReinvite = false;
    this.acceptedSessions[callSession.getId()] = true;

    this.eventEmitter.emit(ON_CALL_ANSWERED, callSession);

    const sipSession = this.sipSessions[callSession.getId()];
    if (sipSession) {
      IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] accept ${sipSession.id}`);

      return this.client.answer(sipSession, this.allowVideo ? cameraEnabled : false).then(() => {
        return callSession.sipCallId;
      });
    }

    return Promise.resolve(null);
  }

  async reject(callSession: CallSession): Promise<void> {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] reject', callSession.getId());

    this.eventEmitter.emit(ON_TERMINATE_SOUND);
    if (!callSession || callSession.getId() in this.rejectedSessions) {
      return;
    }

    this.shouldSendReinvite = false;
    this.rejectedSessions[callSession.getId()] = true;

    const sipSession = this.findSipSession(callSession);
    if (sipSession) {
      IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] reject ${sipSession.id}`);

      this.client.hangup(sipSession);
    }
  }

  async ignore(callSession: CallSession): Promise<void> {
    // kill the ring
    this.eventEmitter.emit(ON_TERMINATE_SOUND, this.audioOutputDeviceId, this.audioOutputVolume);
    this.ignoredSessions[callSession.getId()] = true;
    callSession.ignore();
  }

  hold(callSession: CallSession, withEvent: boolean = true): void {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] hold', callSession.getId());

    const sipSession = this.findSipSession(callSession);

    if (sipSession) {
      this.holdSipSession(sipSession, callSession, withEvent);
    }
  }

  unhold(callSession: CallSession, withEvent: boolean = true): void {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] unhold', callSession ? callSession.getId() : null);

    const sipSession = this.findSipSession(callSession);

    if (sipSession) {
      this.unholdSipSession(sipSession, callSession, withEvent);
    }
  }

  atxfer(callSession: CallSession): ?Object {
    const sipSession = this.findSipSession(callSession);

    if (sipSession) {
      IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] atxfer ${sipSession.id}`);

      return this.client.atxfer(sipSession);
    }
  }

  holdSipSession(sipSession: Session, callSession: ?CallSession, withEvent: boolean = true): void {
    if (!sipSession) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] holld ${sipSession.id}`);

    this.client.hold(sipSession);
    if (withEvent) {
      this.eventEmitter.emit(ON_CALL_HELD, this._createCallSession(sipSession, callSession));
    }
  }

  unholdSipSession(sipSession: Session, callSession: ?CallSession, withEvent: boolean = true): void {
    if (!sipSession) {
      return;
    }
    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] unhold ${sipSession.id}`);

    this.client.unhold(sipSession);
    if (withEvent) {
      this.eventEmitter.emit(ON_CALL_UNHELD, this._createCallSession(sipSession, callSession));
    }
  }

  resume(callSession?: CallSession): void {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] resume', callSession ? callSession.getId() : null);

    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] resume ${sipSession.id}`);

    // Hold current session if different from the current one (we don't want 2 sessions active at the same time).
    if (this.currentSipSession && this.currentSipSession.id !== sipSession.id) {
      IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] hold call ${this.currentSipSession.id} after resume`);
      this.holdSipSession(this.currentSipSession, callSession);
    }

    this.client.unhold(sipSession);
    this.eventEmitter.emit(ON_CALL_RESUMED, this._createCallSession(sipSession, callSession));
    this.currentSipSession = sipSession;
    if (callSession) {
      this.currentCallSession = callSession;
    }
  }

  mute(callSession: ?CallSession, withEvent: boolean = true): void {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] mute', callSession ? callSession.getId() : null);

    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] mute ${sipSession.id}`);
    this.client.mute(sipSession);

    if (withEvent) {
      this.eventEmitter.emit(ON_CALL_MUTED, this._createCallSession(sipSession, callSession, { muted: true }));
    }
  }

  unmute(callSession: ?CallSession, withEvent: boolean = true): void {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] unmute', callSession ? callSession.getId() : null);

    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] unmute ${sipSession.id}`);
    this.client.unmute(sipSession);

    if (withEvent) {
      this.eventEmitter.emit(ON_CALL_UNMUTED, this._createCallSession(sipSession, callSession, { muted: false }));
    }
  }

  turnCameraOn(callSession?: CallSession): void {
    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      return;
    }
    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] turnCameraOn ${sipSession.id}`);

    this.client.toggleCameraOn(sipSession);

    this.eventEmitter.emit(ON_CALL_RESUMED, this._createCameraResumedCallSession(sipSession, callSession));
  }

  turnCameraOff(callSession?: CallSession): void {
    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      return;
    }
    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] turnCameraOff ${sipSession.id}`);

    this.client.toggleCameraOff(sipSession);
    this.eventEmitter.emit(ON_CAMERA_DISABLED, this._createCameraDisabledCallSession(sipSession, callSession));
  }

  sendKey(callSession: ?CallSession, tone: string): void {
    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] sendKey ${sipSession.id}: ${tone}`);
    this.client.sendDTMF(sipSession, tone);
  }

  // Should be async to match CTIPhone definition
  // @TODO: line is not used here
  async makeCall(number: string, line: any, cameraEnabled?: boolean, videoOnly: boolean = false): Promise<?CallSession> {
    if (!number) {
      return Promise.resolve(null);
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] makeCall ${number}`, line ? line.id : null, cameraEnabled);

    if (!this.client.isRegistered()) {
      await this.client.register();
    }
    if (this.currentSipSession) {
      this.holdSipSession(this.currentSipSession, this.currentCallSession, true);
    }

    let sipSession: Session;
    try {
      sipSession = this.client.call(number, this.allowVideo ? cameraEnabled : false, videoOnly);
      this._bindEvents(sipSession);
    } catch (error) {
      console.warn(error);
      IssueReporter.log(IssueReporter.WARN, `[WebRtcPhone] makeCall error ${error.message}, ${error.stack}`);
      return Promise.resolve(null);
    }
    const callSession = this._createOutgoingCallSession(sipSession, cameraEnabled || false);

    this.sipSessions[callSession.getId()] = sipSession;

    this.eventEmitter.emit(ON_PLAY_PROGRESS_SOUND, this.audioOutputDeviceId, this.audioOutputVolume);

    this.currentSipSession = sipSession;
    this.currentCallSession = callSession;

    this.eventEmitter.emit(ON_CALL_OUTGOING, callSession);

    return Promise.resolve(callSession);
  }

  transfer(callSession: ?CallSession, target: string): void {
    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] transfer ${sipSession.id} to ${target}`);

    this.client.transfer(sipSession, target);
  }

  async indirectTransfer(source: CallSession, destination: CallSession): Promise<void> {
    const sipSession = this.sipSessions[source.sipCallId];
    const sipSessionTarget = this.sipSessions[destination.sipCallId];

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] indirectTransfer ${sipSession.id} to ${sipSessionTarget.id}`);

    await sipSessionTarget.refer(sipSession);
  }

  initiateCTIIndirectTransfer() {}

  cancelCTIIndirectTransfer() {}

  confirmCTIIndirectTransfer() {}

  async hangup(callSession: ?CallSession): Promise<boolean> {
    const sipSession = this.findSipSession(callSession);
    if (!sipSession) {
      console.error('Call is unknown to the WebRTC phone');
      return false;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] hangup ${sipSession.id}`);

    const sipSessionId = this.client.getSipSessionId(sipSession);
    if (sipSessionId) {
      delete this.sipSessions[sipSessionId];
      if (callSession) {
        delete this.callSessions[callSession.getId()];
      }
    }

    this.client.hangup(sipSession);
    if (callSession) {
      this.endCurrentCall(callSession);
    }

    this.shouldSendReinvite = false;
    return true;
  }

  endCurrentCall(callSession: CallSession): void {
    if (this.isCurrentCallSipSession(callSession)) {
      this.currentSipSession = undefined;
      this.currentCallSession = null;
    }

    this.eventEmitter.emit(ON_TERMINATE_SOUND, this.audioOutputDeviceId, this.audioOutputVolume);

    if (!this.currentSipSession && this.incomingSessions.length > 0) {
      this.eventEmitter.emit(ON_PLAY_RING_SOUND, this.audioOutputDeviceId, this.audioOutputVolume);
    }
  }

  onConnectionMade(): void {}

  async close(): Promise<void> {
    IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] close');
    await this.unregister();
    this.client.close();
    this.unbind();

    this.sipSessions = {};
    this.incomingSessions = [];
    this.currentSipSession = null;
    this.currentCallSession = null;
    this.shouldSendReinvite = false;
    this.rejectedSessions = {};
  }

  isRegistered(): boolean {
    return this.client && this.client.isRegistered();
  }

  enableRinging(): Promise<void> | void {
    this.ringingEnabled = true;
  }

  disableRinging(): Promise<void> | void {
    this.ringingEnabled = false;
  }

  getCurrentCallSession(): ?CallSession {
    if (!this.currentSipSession) {
      return null;
    }

    return this._createCallSession(this.currentSipSession);
  }

  hasIncomingCallSession(): boolean {
    return this.incomingSessions.length > 0;
  }

  getIncomingCallSession(): ?CallSession {
    if (!this.hasIncomingCallSession()) {
      return null;
    }

    const sessionId = this.incomingSessions[0];

    return this._createCallSession(this.sipSessions[sessionId]);
  }

  sendMessage(sipSession: Session = null, body: string, contentType: string = 'text/plain') {
    if (!sipSession) {
      return;
    }

    IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] sendMessage ${sipSession.id}`);

    try {
      sipSession.message({
        requestOptions: {
          body: {
            content: body,
            contentType,
          },
        },
      });
    } catch (e) {
      console.warn(e);
    }
  }

  getLocalMediaStream(callSession: CallSession) {
    const sipSession = this.findSipSession(callSession);

    return sipSession ? this.client.getLocalMediaStream(sipSession) : null;
  }

  setMediaConstraints(media: MediaStreamConstraints) {
    this.client.setMediaConstraints(media);
  }

  bindClientEvents() {
    this.client.unbind();

    this.client.on(this.client.INVITE, (sipSession: Session, wantsToDoVideo: boolean) => {
      const autoAnswer = sipSession.request.getHeader('Answer-Mode') === 'Auto';
      const withVideo = this.allowVideo ? wantsToDoVideo : false;
      IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] invite ${sipSession.id}`, withVideo, autoAnswer);

      const callSession = this._createIncomingCallSession(sipSession, withVideo, null, autoAnswer);
      this.incomingSessions.push(callSession.getId());
      this._bindEvents(sipSession);

      this.sipSessions[callSession.getId()] = sipSession;

      if (!this.currentSipSession) {
        if (this.ringingEnabled) {
          this.eventEmitter.emit(ON_TERMINATE_SOUND);
          this.eventEmitter.emit(ON_PLAY_RING_SOUND, this.audioRingDeviceId, this.audioRingVolume);
        }
      } else {
        this.eventEmitter.emit(ON_TERMINATE_SOUND);
        this.eventEmitter.emit(ON_PLAY_INBOUND_CALL_SIGNAL_SOUND, this.audioOutputDeviceId, this.audioOutputVolume);
      }

      this.eventEmitter.emit(ON_CALL_INCOMING, callSession, wantsToDoVideo);
    });

    this.client.on(this.client.ON_REINVITE, (...args) => {
      IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] reinvite ${args[0].id} (${args[1].id})`);
      this.eventEmitter.emit.apply(this.eventEmitter, [this.client.ON_REINVITE, ...args]);
    });

    this.client.on(this.client.ACCEPTED, (sipSession: Session) => {
      IssueReporter.log(IssueReporter.INFO, `[WebRtcPhone] accepted ${sipSession.id}`);

      this._onCallAccepted(sipSession, this.client.sessionHasVideo(this.client.getSipSessionId(sipSession)));

      if (this.audioOutputDeviceId) {
        this.client.changeAudioOutputDevice(this.audioOutputDeviceId);
      }
    });
    this.client.on('ended', () => {});

    this.client.on(this.client.UNREGISTERED, () => {
      IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] unregistered');
      this.eventEmitter.emit(ON_UNREGISTERED);
    });

    this.client.on(this.client.REGISTERED, () => {
      IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] registered');
      this.stopHeartbeat();
      this.eventEmitter.emit(ON_REGISTERED);

      // If the phone registered with a current callSession (eg: when switching network):
      // send a reinvite to renegociate ICE with new IP
      if (this.shouldSendReinvite && this.currentSipSession) {
        this.shouldSendReinvite = false;
        try {
          this.sendReinvite(this.currentSipSession);
        } catch (e) {
          IssueReporter.log(IssueReporter.ERROR, `[WebRtcPhone] Reinvite error : ${e.message} (${e.stack})`);
        }
      }
    });

    this.client.on(this.client.CONNECTED, () => {
      IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] client connected');

      this.stopHeartbeat();
    });

    this.client.on(this.client.DISCONNECTED, () => {
      IssueReporter.log(IssueReporter.INFO, '[WebRtcPhone] client discconnected');

      this.eventEmitter.emit(ON_UNREGISTERED);

      // Do not trigger heartbeat if already running
      if (!this.client.hasHeartbeat()) {
        this.startHeartbeat();
      }

      // Tell to send reinvite when reconnecting
      this.shouldSendReinvite = true;
    });

    this.client.on(this.client.ON_TRACK, (session, event) => {
      this.eventEmitter.emit(ON_TRACK, session, event);
    });

    this.client.on('onVideoInputChange', stream => {
      this.eventEmitter.emit(ON_VIDEO_INPUT_CHANGE, stream);
    });

    this.client.on(this.client.MESSAGE, (message: Message) => {
      this.eventEmitter.emit(ON_MESSAGE, message);
    });
  }

  // Find a corresponding sipSession from a CallSession
  findSipSession(callSession: ?CallSession): ?Session {
    const keys = Object.keys(this.sipSessions);
    const keyIndex = keys.findIndex(sessionId => callSession && callSession.isId(sessionId));
    if (keyIndex === -1) {
      const currentSipSessionId = this.currentSipSession
        ? this.client.getSipSessionId(this.currentSipSession)
        : Object.keys(this.sipSessions)[0];
      return currentSipSessionId ? this.sipSessions[currentSipSessionId] : null;
    }

    return this.sipSessions[keys[keyIndex]];
  }

  _createIncomingCallSession(
    sipSession: Session,
    cameraEnabled: boolean,
    fromSession?: ?CallSession,
    autoAnswer: boolean = false,
  ): CallSession {
    return this._createCallSession(sipSession, fromSession, {
      incoming: true,
      ringing: true,
      cameraEnabled,
      autoAnswer,
    });
  }

  _createOutgoingCallSession(
    sipSession: Session,
    cameraEnabled: boolean,
    fromSession?: CallSession,
  ): CallSession {
    return this._createCallSession(sipSession, fromSession, { incoming: false, ringing: true, cameraEnabled });
  }

  _createAcceptedCallSession(
    sipSession: Session,
    cameraEnabled?: boolean,
    fromSession?: CallSession,
  ): CallSession {
    return this._createCallSession(sipSession, fromSession, {
      cameraEnabled: cameraEnabled !== undefined ? cameraEnabled : false,
    });
  }

  _createMutedCallSession(sipSession: Session, fromSession?: CallSession): CallSession {
    return this._createCallSession(sipSession, fromSession, {
      muted: true,
    });
  }

  _createUnmutedCallSession(sipSession: Session, fromSession?: CallSession): CallSession {
    return this._createCallSession(sipSession, fromSession, {
      muted: false,
    });
  }

  _createCameraResumedCallSession(sipSession: Session, fromSession?: CallSession): CallSession {
    return this._createCallSession(sipSession, fromSession, {
      videoMuted: false,
    });
  }

  _createCameraDisabledCallSession(sipSession: Session, fromSession?: CallSession): CallSession {
    return this._createCallSession(sipSession, fromSession, {
      videoMuted: true,
    });
  }

  _createCallSession(sipSession: Session, fromSession?: ?CallSession, extra: Object = {}): CallSession {
    // eslint-disable-next-line
    const number = sipSession.remoteIdentity.uri._normal.user;
    const { state } = sipSession;

    const callSession = new CallSession({
      callId: fromSession && fromSession.callId,
      sipCallId: this.client.getSipSessionId(sipSession),
      sipStatus: state,
      displayName: sipSession.remoteIdentity.displayName || number,
      startTime: fromSession ? fromSession.startTime : new Date(),
      answered: state === SessionState.Established,
      paused: this.client.isCallHeld(sipSession),
      isCaller: 'incoming' in extra ? !extra.incoming : false,
      cameraEnabled: fromSession ? fromSession.isCameraEnabled() : this.client.sessionWantsToDoVideo(sipSession),
      number,
      ringing: false,
      muted: fromSession ? fromSession.isMuted() : false,
      videoMuted: fromSession ? fromSession.isVideoMuted() : false,
      ...extra,
    });

    this.callSessions[callSession.getId()] = callSession;

    return callSession;
  }

  _parseSDP(sdp: string) {
    const labelMatches = sdp.match(/a=label:(.*)/m);
    const msidMatches = sdp.match(/a=msid:(.*)/gm);

    const label = labelMatches && labelMatches.length && labelMatches[1];
    const msid = msidMatches && msidMatches.length && msidMatches[msidMatches.length - 1].split(' ')[1];

    return { label, msid };
  }
}
