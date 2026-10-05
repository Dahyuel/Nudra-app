FROM node:24-alpine
WORKDIR /app
COPY infra/domain-auth.mjs ./domain-auth.mjs
USER node
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "domain-auth.mjs"]
