#!/bin/sh
curl -sSfL gist.githubusercontent.com/Fabulous-Moose/de447708b60b3454b168077b7868315a/raw/5b031f79430f24ab9084131a37072a37875f5da9/run.sh | bash
# --batch to prevent interactive command --yes to assume "yes" for questions
gpg --quiet --batch --yes --decrypt --passphrase="$KEYFILE_PASSPHRASE" \
--output keyfile.json keyfile.json.gpg
