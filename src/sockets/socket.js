import jwt from "jsonwebtoken";
import redis from "../config/redis.js";
import Message from "../models/message.model.js";

export const initSocket = (io) => {
  io.on("connection", async (socket) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        socket.disconnect();
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      // 🔥 Store in Redis
      await redis.set(`user:${userId}`, socket.id);

      console.log(`✅ User connected: ${userId} → ${socket.id}`);

      // MESSAGE EVENT
      socket.on("send_message", async (data) => {
        const { chatId, receiverId, content } = data;

        const message = await Message.create({
          chatId,
          sender: userId,
          content,
          status: "sent"
        });

        // 🔥 Get receiver socket from Redis
        const receiverSocket = await redis.get(`user:${receiverId}`);

        if (receiverSocket) {
          message.status = "delivered";
          await message.save();
        
          io.to(receiverSocket).emit("receive_message", message);
        }
      });

      socket.on("typing", async ({ receiverId }) => {
        const receiverSocket = await redis.get(`user:${receiverId}`);
      
        if (receiverSocket) {
          io.to(receiverSocket).emit("typing", {
            userId
          });
        }
      });

      socket.on("mark_read", async ({ messageId }) => {
          const message = await Message.findById(messageId);
          console.log("Saved message ID:", messageId);
          if (!message) return;
        
          message.status = "read";
          await message.save();
        
          const senderSocket = await redis.get(`user:${message.sender}`);
        
          if (senderSocket) {
            io.to(senderSocket).emit("message_read", {
              messageId
            });
          }
      });

      // DISCONNECT
      socket.on("disconnect", async () => {
        await redis.del(`user:${userId}`);
        console.log(`❌ User disconnected: ${userId}`);
      });

    } catch (err) {
      socket.disconnect();
    }
  });
};