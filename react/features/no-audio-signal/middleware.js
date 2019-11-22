// @flow
import { setNoAudioSignalNotificationUid } from './actions';
import { APP_WILL_MOUNT, APP_WILL_UNMOUNT } from '../base/app';
import { CONFERENCE_JOINED } from '../base/conference';
import {
    formatDeviceLabel,
    setAudioInputDevice
} from '../base/devices';
import JitsiMeetJS, { JitsiConferenceEvents } from '../base/lib-jitsi-meet';
import { MiddlewareRegistry } from '../base/redux';
import { updateSettings } from '../base/settings';
import { playSound, registerSound, unregisterSound } from '../base/sounds';
import { NO_AUDIO_SIGNAL_SOUND_ID } from './constants';
import { hideNotification, showNotification } from '../notifications';
import { NO_AUDIO_SIGNAL_SOUND_FILE } from './sounds';

MiddlewareRegistry.register(store => next => async action => {
    const result = next(action);
    const { dispatch, getState } = store;
    const { conference } = action;
    let confAudioInputState;

    switch (action.type) {
    case APP_WILL_MOUNT:
        dispatch(registerSound(NO_AUDIO_SIGNAL_SOUND_ID, NO_AUDIO_SIGNAL_SOUND_FILE));
        break;
    case APP_WILL_UNMOUNT:
        dispatch(unregisterSound(NO_AUDIO_SIGNAL_SOUND_ID));
        break;

    case CONFERENCE_JOINED: {
        conference.on(JitsiConferenceEvents.AUDIO_INPUT_STATE_CHANGE, hasAudioInput => {
            const { noAudioSignalNotificationUid } = getState()['features/no-audio-signal'];

            confAudioInputState = hasAudioInput;

            if (noAudioSignalNotificationUid && hasAudioInput) {
                dispatch(hideNotification(noAudioSignalNotificationUid));
                dispatch(setNoAudioSignalNotificationUid());
            }
        });
        conference.on(JitsiConferenceEvents.NO_AUDIO_INPUT, async () => {
            const { noSrcDataNotificationUid } = getState()['features/base/no-src-data'];

            // In case the 'no data detected from source' notification was already shown, we prevent the
            // no audio signal notification as it's redundant i.e. it's clear that the users microphone is
            // muted from system settings.
            if (noSrcDataNotificationUid) {
                return;
            }

            // Force the flag to false in case AUDIO_INPUT_STATE_CHANGE is received after the notification is displayed,
            // thus making sure we check properly if the notification should display.
            confAudioInputState = false;


            const activeDevice = await JitsiMeetJS.getActiveAudioDevice();

            if (confAudioInputState) {
                return;
            }

            // In case there is a previous notification displayed just hide it.
            const { noAudioSignalNotificationUid } = getState()['features/no-audio-signal'];

            if (noAudioSignalNotificationUid) {
                dispatch(hideNotification(noAudioSignalNotificationUid));
                dispatch(setNoAudioSignalNotificationUid());
            }


            let descriptionKey = 'toolbar.noAudioSignalDesc';
            let customActionNameKey;
            let customActionHandler;

            // In case the detector picked up a device show a notification with a device suggestion
            if (activeDevice.deviceLabel !== '') {
                descriptionKey = 'toolbar.noAudioSignalDescSuggestion';

                // Preferably the label should be passed as an argument paired with a i18next string, however
                // at the point of the implementation the showNotification function only supports doing that for
                // the description.
                // TODO Add support for arguments to showNotification title and customAction strings.
                customActionNameKey = `Use ${formatDeviceLabel(activeDevice.deviceLabel)}`;
                customActionHandler = () => {
                    // Select device callback
                    dispatch(
                            updateSettings({
                                userSelectedMicDeviceId: activeDevice.deviceId,
                                userSelectedMicDeviceLabel: activeDevice.deviceLabel
                            })
                    );

                    dispatch(setAudioInputDevice(activeDevice.deviceId));
                };
            }

            const notification = showNotification({
                titleKey: 'toolbar.noAudioSignalTitle',
                descriptionKey,
                customActionNameKey,
                customActionHandler
            });

            dispatch(notification);

            dispatch(playSound(NO_AUDIO_SIGNAL_SOUND_ID));

            // Store the current notification uid so we can check for this state and hide it in case
            // a new track was added, thus changing the context of the notification
            dispatch(setNoAudioSignalNotificationUid(notification.uid));
        });
        break;
    }
    }

    return result;
});