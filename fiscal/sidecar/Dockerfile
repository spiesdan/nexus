FROM php:8.3-cli

# ext-soap exige libxml dev no build; o resto vem no core ou via docker-php-ext-install.
#
# `libonig-dev` é o que o `mbstring` linka, e ele NÃO vem na imagem. Sem esta
# linha o build morre em `Package 'oniguruma', required by 'virtual:world', not
# found` — que é como este Dockerfile quebrado apareceu pela primeira vez: ele
# NUNCA foi construído, então o nome do pacote nunca teve chance de ser conferido.
# Medido nesta máquina: `php:8.3-cli` é Debian 13 (trixie) e `libonig-dev` está
# disponível (`6.9.9-1+b1`).
RUN apt-get update && apt-get install -y \
    libxml2-dev \
    libzip-dev \
    libonig-dev \
    libpng-dev \
    libjpeg-dev \
    libwebp-dev \
    unzip \
  && docker-php-ext-install -j$(nproc) soap mbstring dom xml zip gd \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY composer.json ./
# Sem composer.lock de propósito: o lock do OPERADOR (gerado no primeiro build
# na VPS dele) é o que vale — travar versão daqui envelhece na primeira NT nova.
RUN composer install --no-dev --prefer-dist --no-interaction

COPY public/ ./public/
COPY src/ ./src/

# /certs é VOLUME do operador (o .pfx A1 entra por SCP, nunca por upload web).
VOLUME ["/certs"]

EXPOSE 8080
CMD ["php", "-S", "0.0.0.0:8080", "-t", "public"]
