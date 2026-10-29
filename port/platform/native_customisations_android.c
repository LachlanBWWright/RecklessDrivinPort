/* Android native customisations are hosted by MainActivity on its UI thread.
 * SDL's game thread waits in Java while the dialog/file picker is active. */
#include "native_customisations.h"
#include <SDL.h>
#include <SDL_system.h>
#include <jni.h>
#include <stdlib.h>
#include <string.h>

int RDPlatformShowCustomisations(RDCustomisations *settings)
{
    JNIEnv *env = SDL_AndroidGetJNIEnv();
    jobject activity = SDL_AndroidGetActivity();
    if (!env || !activity) return 0;
    jclass activityClass = (*env)->GetObjectClass(env, activity);
    jmethodID show = (*env)->GetMethodID(env, activityClass, "showCustomisations",
                                      "([ILjava/lang/String;)[Ljava/lang/String;");
    int applied = 0;
    if (show) {
        jint values[8] = {settings->levelEnabled, settings->level,
            settings->hasStartY, settings->startY, settings->hasObjectGroupStartY,
            settings->objectGroupStartY, (jint)settings->forcedAddOns,
            (jint)settings->disabledBonusRollMask};
        jintArray input = (*env)->NewIntArray(env, 8);
        jstring path = (*env)->NewStringUTF(env, settings->resourcePath);
        if (input && path) {
            (*env)->SetIntArrayRegion(env, input, 0, 8, values);
            jobjectArray result = (*env)->CallObjectMethod(env, activity, show, input, path);
            if (!(*env)->ExceptionCheck(env) && result &&
                (*env)->GetArrayLength(env, result) == 9) {
                for (int i = 0; i < 9; i++) {
                    jstring item = (*env)->GetObjectArrayElement(env, result, i);
                    const char *text = item ? (*env)->GetStringUTFChars(env, item, NULL) : NULL;
                    if (text) {
                        if (i < 8) values[i] = (jint)strtol(text, NULL, 10);
                        else {
                            strncpy(settings->resourcePath, text, sizeof(settings->resourcePath) - 1);
                            settings->resourcePath[sizeof(settings->resourcePath) - 1] = '\0';
                        }
                        (*env)->ReleaseStringUTFChars(env, item, text);
                    }
                    if (item) (*env)->DeleteLocalRef(env, item);
                }
                settings->levelEnabled = values[0];
                settings->level = values[1];
                settings->hasStartY = values[2];
                settings->startY = values[3];
                settings->hasObjectGroupStartY = values[4];
                settings->objectGroupStartY = values[5];
                settings->forcedAddOns = (unsigned)values[6];
                settings->disabledBonusRollMask = (unsigned)values[7];
                applied = 1;
            }
            if (result) (*env)->DeleteLocalRef(env, result);
        }
        if (path) (*env)->DeleteLocalRef(env, path);
        if (input) (*env)->DeleteLocalRef(env, input);
    }
    if ((*env)->ExceptionCheck(env)) {
        (*env)->ExceptionDescribe(env);
        (*env)->ExceptionClear(env);
    }
    (*env)->DeleteLocalRef(env, activityClass);
    (*env)->DeleteLocalRef(env, activity);
    return applied;
}

void RDPlatformRestart(void)
{
    JNIEnv *env = SDL_AndroidGetJNIEnv();
    jobject activity = SDL_AndroidGetActivity();
    if (!env || !activity) return;
    jclass activityClass = (*env)->GetObjectClass(env, activity);
    jmethodID restart = (*env)->GetMethodID(env, activityClass, "restartGame", "()V");
    if (restart) (*env)->CallVoidMethod(env, activity, restart);
    if ((*env)->ExceptionCheck(env)) {
        (*env)->ExceptionDescribe(env);
        (*env)->ExceptionClear(env);
    }
    (*env)->DeleteLocalRef(env, activityClass);
    (*env)->DeleteLocalRef(env, activity);
}
