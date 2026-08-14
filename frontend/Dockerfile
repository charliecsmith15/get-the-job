# Use Node.js LTS Alpine image for a small footprint
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port Cloud Run expects
EXPOSE 8080

# Start the Express server
CMD ["npm", "start"]
