#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-order-management}"
REGION="${AWS_REGION:-us-east-1}"
PDF_LIB="fpdf2==2.7.9"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
CODE_BUCKET="${CODE_BUCKET:-oms-deploy-${ACCOUNT_ID}-${REGION}}"

LAB_ROLE_ARN="$(aws iam list-roles --query "Roles[?RoleName=='LabRole'].Arn" --output text)"
if [ -z "$LAB_ROLE_ARN" ] || [ "$LAB_ROLE_ARN" = "None" ]; then
  echo "ERROR: LabRole not found. Are your Learner Lab credentials configured?" >&2
  exit 1
fi
echo "Using LabRole: $LAB_ROLE_ARN"

if ! aws s3api head-bucket --bucket "$CODE_BUCKET" 2>/dev/null; then
  echo "Creating code bucket: $CODE_BUCKET"
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$CODE_BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$CODE_BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
fi

echo "Bundling $PDF_LIB into generateSummary..."
pip install "$PDF_LIB" --target backend/generateSummary --upgrade --quiet

aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket "$CODE_BUCKET" \
  --output-template-file packaged.yaml

aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name "$STACK_NAME" \
  --parameter-overrides LabRoleArn="$LAB_ROLE_ARN" \
  --capabilities CAPABILITY_IAM \
  --region "$REGION"

echo ""
echo "Stack outputs:"
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs" --output table
