import sys
import time
import json
import itchat

class WeChatBot:
    def __init__(self):
        self.bot = None

    def login(self):
        """登录微信"""
        try:
            print("正在启动微信登录...")
            sys.stdout.flush()
            
            # 新建实例并登录
            itchat.auto_login(hotReload=True, statusStorageDir='wechat.pkl')
            self.bot = itchat
            
            print("LOGIN_SUCCESS")
            sys.stdout.flush()
            return True
        except Exception as e:
            print(f"LOGIN_FAILED: {str(e)}")
            sys.stdout.flush()
            return False

    def send_message(self, msg):
        """发送消息"""
        try:
            if not self.bot:
                return False

            # 发送到文件传输助手
            self.bot.send(msg, toUserName='filehelper')
            return True
        except Exception as e:
            print(f"ERROR: {str(e)}")
            return False

    def logout(self):
        """登出"""
        if self.bot:
            self.bot.logout()

def main():
    bot = WeChatBot()
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "init":
            if bot.login():
                time.sleep(5)  # 等待一会确保登录成功
                sys.exit(0)
            else:
                sys.exit(1)
                
        elif command == "test":
            if bot.login():
                if bot.send_message("测试消息"):
                    print(json.dumps({
                        "status": "success",
                        "message": "测试消息发送成功"
                    }))
                    sys.exit(0)
            sys.exit(1)
            
        elif command == "send" and len(sys.argv) > 2:
            if bot.login():
                message = sys.argv[2]
                if bot.send_message(message):
                    print(json.dumps({
                        "status": "success",
                        "message": "消息发送成功"
                    }))
                    sys.exit(0)
            sys.exit(1)

if __name__ == "__main__":
    main()