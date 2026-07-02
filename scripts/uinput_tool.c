#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

static void emit_event(int fd, int type, int code, int value) {
    struct input_event ev;
    memset(&ev, 0, sizeof(ev));
    ev.type = type;
    ev.code = code;
    ev.value = value;
    if (write(fd, &ev, sizeof(ev)) != sizeof(ev)) {
        perror("write");
        exit(1);
    }
}

static int setup_device(void) {
    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) {
        perror("open /dev/uinput");
        exit(1);
    }

    ioctl(fd, UI_SET_EVBIT, EV_SYN);
    ioctl(fd, UI_SET_EVBIT, EV_KEY);
    ioctl(fd, UI_SET_KEYBIT, BTN_LEFT);
    ioctl(fd, UI_SET_KEYBIT, KEY_PAGEDOWN);
    ioctl(fd, UI_SET_KEYBIT, KEY_PAGEUP);
    ioctl(fd, UI_SET_KEYBIT, KEY_ESC);
    ioctl(fd, UI_SET_EVBIT, EV_ABS);
    ioctl(fd, UI_SET_ABSBIT, ABS_X);
    ioctl(fd, UI_SET_ABSBIT, ABS_Y);
    ioctl(fd, UI_SET_EVBIT, EV_REL);
    ioctl(fd, UI_SET_RELBIT, REL_WHEEL);

    struct uinput_user_dev uidev;
    memset(&uidev, 0, sizeof(uidev));
    snprintf(uidev.name, UINPUT_MAX_NAME_SIZE, "openclaw-uinput-tool");
    uidev.id.bustype = BUS_USB;
    uidev.id.vendor = 0x1209;
    uidev.id.product = 0x0001;
    uidev.id.version = 1;

    uidev.absmin[ABS_X] = 0;
    uidev.absmax[ABS_X] = 1919;
    uidev.absmin[ABS_Y] = 0;
    uidev.absmax[ABS_Y] = 1079;

    if (write(fd, &uidev, sizeof(uidev)) != sizeof(uidev)) {
        perror("write uinput_user_dev");
        exit(1);
    }
    if (ioctl(fd, UI_DEV_CREATE) < 0) {
        perror("UI_DEV_CREATE");
        exit(1);
    }
    usleep(250000);
    return fd;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "usage: %s click X Y | wheel N | key pagedown|pageup|esc\n", argv[0]);
        return 2;
    }

    int fd = setup_device();

    if (strcmp(argv[1], "click") == 0 && argc == 4) {
        int x = atoi(argv[2]);
        int y = atoi(argv[3]);
        emit_event(fd, EV_ABS, ABS_X, x);
        emit_event(fd, EV_ABS, ABS_Y, y);
        emit_event(fd, EV_SYN, SYN_REPORT, 0);
        usleep(100000);
        emit_event(fd, EV_KEY, BTN_LEFT, 1);
        emit_event(fd, EV_SYN, SYN_REPORT, 0);
        usleep(70000);
        emit_event(fd, EV_KEY, BTN_LEFT, 0);
        emit_event(fd, EV_SYN, SYN_REPORT, 0);
    } else if (strcmp(argv[1], "wheel") == 0 && argc == 3) {
        emit_event(fd, EV_REL, REL_WHEEL, atoi(argv[2]));
        emit_event(fd, EV_SYN, SYN_REPORT, 0);
    } else if (strcmp(argv[1], "key") == 0 && argc == 3) {
        int key = 0;
        if (strcmp(argv[2], "pagedown") == 0) key = KEY_PAGEDOWN;
        if (strcmp(argv[2], "pageup") == 0) key = KEY_PAGEUP;
        if (strcmp(argv[2], "esc") == 0) key = KEY_ESC;
        if (!key) {
            fprintf(stderr, "unknown key: %s\n", argv[2]);
            return 2;
        }
        emit_event(fd, EV_KEY, key, 1);
        emit_event(fd, EV_SYN, SYN_REPORT, 0);
        usleep(70000);
        emit_event(fd, EV_KEY, key, 0);
        emit_event(fd, EV_SYN, SYN_REPORT, 0);
    } else {
        fprintf(stderr, "usage: %s click X Y | wheel N | key pagedown|pageup|esc\n", argv[0]);
        return 2;
    }

    usleep(100000);
    ioctl(fd, UI_DEV_DESTROY);
    close(fd);
    return 0;
}
