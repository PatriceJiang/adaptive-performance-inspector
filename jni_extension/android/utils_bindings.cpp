#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include "adpf_manager.h"
#include "bindings/jswrapper/SeApi.h"
#include "platform/java/jni/JniImp.h"

namespace {

bool jsb_thermal_value(se::State &s) // NOLINT(readability-identifier
{
    s.rval().setFloat(ADPFManager::getInstance().GetThermalHeadroom());
    return true;
}
SE_BIND_PROP_GET(jsb_thermal_value)

bool jsb_thermal_status(se::State &s) // NOLINT(readability-identifier
{
    s.rval().setFloat(ADPFManager::getInstance().GetThermalStatusNormalized());
    return true;
}
SE_BIND_PROP_GET(jsb_thermal_status)

struct PortAndAddr {
    struct sockaddr_in addr {
        0
    };
    int socketfd{-1};
};
inline size_t hasher(const std::string &addr, int port) {
    size_t strHash = std::hash<std::string>()(addr);
    size_t fullHash = std::hash<int>()(port) ^ strHash;
    return fullHash;
}

std::unordered_map<size_t, PortAndAddr> fdMap{};
PortAndAddr &getFdWithAddressAndPort(const std::string &addr, int port) {
    size_t fullHash = hasher(addr, port);
    if (fdMap.find(fullHash) == fdMap.end()) {
        PortAndAddr pa;
        pa.socketfd = socket(AF_INET, SOCK_DGRAM, 0);
        memset(&pa.addr, 0, sizeof(pa.addr));
        pa.addr.sin_family = AF_INET;
        pa.addr.sin_port = htons(port);
        pa.addr.sin_addr.s_addr = inet_addr(addr.c_str());
        fdMap[fullHash] = pa;
    }
    return fdMap[fullHash];
}

bool jsb_sendUDP(se::State &state) { // NOLINT
    const auto &args = state.args();
    if (args.size() != 3) {
        SE_REPORT_ERROR("Invalid arguments size %d, expected %d",
                        static_cast<int>(args.size()), 3);
        return false;
    }
    auto address = args[0].toString();
    auto port = args[1].toInt32();
    auto data = args[2].toString();

    auto &dst = getFdWithAddressAndPort(address, port);

    auto ret =
        sendto(dst.socketfd, data.c_str(), data.size(), 0,
               reinterpret_cast<struct sockaddr *>(&dst.addr), sizeof(dst.addr));
    if (ret < 0) {
        perror("sendto ");
        return false;
    }
    return true;
}
SE_BIND_FUNC(jsb_sendUDP);

bool jsb_listenUDP(se::State &state) { // NOLINT
    const auto &args = state.args();
    state.rval().setInt32(-1);
    if (args.size() != 1) {
        SE_REPORT_ERROR("Invalid arguments size %d, expected %d",
                        static_cast<int>(args.size()), 1);
        return false;
    }
    auto port = args[0].toInt32();

    auto &dst = getFdWithAddressAndPort("0.0.0.0", port);
    int broadcast = 1;
    auto ret = setsockopt(dst.socketfd, SOL_SOCKET, SO_BROADCAST, &broadcast,
                          sizeof(broadcast));
    if (ret) {
        perror("setsockopt");
        return false;
    }
    int flags = fcntl(dst.socketfd, F_GETFL, 0);
    flags |= O_NONBLOCK;
    fcntl(dst.socketfd, F_SETFL, flags);

    ret = bind(dst.socketfd, reinterpret_cast<struct sockaddr *>(&dst.addr),
               sizeof(dst.addr));
    if (ret < 0) {
        perror("bind ");
        return false;
    }
    state.rval().setInt32(dst.socketfd);
    return true;
}
SE_BIND_FUNC(jsb_listenUDP);

bool jsb_recvUDP(se::State &state) { // NOLINT
    const auto &args = state.args();
    if (args.size() != 1) {
        SE_REPORT_ERROR("Invalid arguments size %d, expected %d",
                        static_cast<int>(args.size()), 1);
        return false;
    }
    sockaddr_in clientAddr;
    auto fd = args[0].toInt32();
    std::vector<se::Value> arrayObj;

    do {
        char buff[512] = {0};
        socklen_t addrLen{sizeof(clientAddr)};
        auto bytesRead = recvfrom(
            fd, buff, 511, 0, reinterpret_cast<sockaddr *>(&clientAddr), &addrLen);
        if (bytesRead <= 0) {
            //            if (bytesRead < 0) perror("recvfrom");
            SE_REPORT_ERROR("Recvfrom %s: %s", strerror(errno), buff);
            if (errno == EAGAIN) {
                break;
            }
            break;
        }
        buff[bytesRead] = 0;
        se::HandleObject dataBuffer(
            se::Object::createArrayBufferObject(buff, bytesRead));
        memset(buff, 0, 512);
        inet_ntop(AF_INET, &(clientAddr.sin_addr), buff, 512);
        auto port = ntohs(clientAddr.sin_port);
        se::HandleObject ret{se::Object::createPlainObject()};
        ret->setProperty("data", se::Value(dataBuffer));
        ret->setProperty("port", se::Value(port));
        ret->setProperty("ip", se::Value(buff));
        arrayObj.emplace_back(ret);
    } while (true);

    se::HandleObject arrayJSOBj{se::Object::createArrayObject(arrayObj.size())};
    for (auto i = 0; i < arrayObj.size(); i++) {
        arrayJSOBj->setArrayElement(i, arrayObj[i]);
    }
    state.rval().setObject(arrayJSOBj);

    return true;
}
SE_BIND_FUNC(jsb_recvUDP);

bool jsb_unlistenUDP(se::State &state) { // NOLINT
    const auto &args = state.args();
    state.rval().setBoolean(false);
    if (args.size() != 1) {
        SE_REPORT_ERROR("Invalid arguments size %d, expected %d",
                        static_cast<int>(args.size()), 1);
        return false;
    }
    auto fd = args[0].toInt32();
    for (auto item = fdMap.begin(); item != fdMap.end(); item++) {
        if (item->second.socketfd == fd) {
            close(fd);
            fdMap.erase(item);
            break;
        }
    }
    state.rval().setBoolean(true);
    return true;
}
SE_BIND_FUNC(jsb_unlistenUDP);
} // namespace

bool jsb_register_udpUtils(se::Object *targetNs) { // NOLINT
    targetNs->defineFunction("sendUDP", _SE(jsb_sendUDP));
    targetNs->defineFunction("recvUDP", _SE(jsb_recvUDP));
    targetNs->defineFunction("listenUDP", _SE(jsb_listenUDP));
    targetNs->defineFunction("unlistenUDP", _SE(jsb_unlistenUDP));
    return true;
}

bool jsb_register_thermalInfo(se::Object *targetNs) { // NOLINT
    se::Value targetValue;
    targetNs->getProperty("thermalInfo", &targetValue);
    if (targetValue.isUndefined()) {
        targetValue.setObject(se::Object::createPlainObject());
        targetNs->setProperty("thermalInfo", targetValue);
    }
    se::Object *obj = targetValue.toObject();

    auto &mgr = ADPFManager::getInstance();
    obj->defineFunction("thermalValue", _SE(jsb_thermal_value));
    obj->defineFunction("thermalStatus", _SE(jsb_thermal_status));
    return true;
}