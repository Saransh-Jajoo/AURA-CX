"""Audit logging service for compliance and security auditing.

Writes immutable append-only records to PostgreSQL audit_events table.
For fintech/banking compliance: Never update or delete audit logs.
Retention: 5 years minimum per RBI guidelines.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import AuditEvent

logger = logging.getLogger("aura_cx.audit_logging")


class AuditLogger:
    """Immutable audit log writer for compliance."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def log_action(
        self,
        tenant_id: str,
        user_id: Optional[str],
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        details: Optional[dict] = None,
        previous_state: Optional[dict] = None,
        new_state: Optional[dict] = None,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditEvent:
        """
        Record an audit event.
        
        Args:
            tenant_id: Tenant identifier
            user_id: User performing the action
            action: Action name (e.g., "api_call", "data_access", "config_change", "login_failed")
            resource_type: Type of resource affected (e.g., "ticket", "user", "integration", "webhook")
            resource_id: ID of the resource affected
            details: Additional structured details (arbitrary dict)
            previous_state: State before change (for mutations)
            new_state: State after change (for mutations)
            reason: Why the action was taken (for compliance)
            ip_address: Source IP address
            user_agent: HTTP User-Agent string
        
        Returns:
            AuditEvent record
        
        Note:
            This is an immutable insert-only operation.
            No updates or deletes should ever be performed on audit_events.
        """
        
        event = AuditEvent(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            previous_state=previous_state,
            new_state=new_state,
            reason=reason,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=datetime.now(timezone.utc),
        )
        
        self.session.add(event)
        
        # Log to application logger as well for real-time monitoring
        logger.info(
            "AUDIT: action=%s, tenant=%s, user=%s, resource=%s, ip=%s",
            action, tenant_id, user_id, resource_type, ip_address
        )
        
        return event
    
    async def log_api_call(
        self,
        tenant_id: str,
        user_id: Optional[str],
        method: str,
        path: str,
        status_code: int,
        response_time_ms: float,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditEvent:
        """Log an API call for audit trail."""
        
        return await self.log_action(
            tenant_id=tenant_id,
            user_id=user_id,
            action="api_call",
            resource_type="api_endpoint",
            details={
                "method": method,
                "path": path,
                "status_code": status_code,
                "response_time_ms": response_time_ms,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    
    async def log_webhook_received(
        self,
        tenant_id: str,
        platform: str,
        message_id: str,
        source_ip: str,
        signature_valid: bool,
    ) -> AuditEvent:
        """Log incoming webhook for webhook audit trail."""
        
        return await self.log_action(
            tenant_id=tenant_id,
            user_id=None,  # Webhooks are not user-initiated
            action="webhook_received",
            resource_type="webhook",
            resource_id=message_id,
            details={
                "platform": platform,
                "message_id": message_id,
                "signature_valid": signature_valid,
            },
            ip_address=source_ip,
        )
    
    async def log_ai_classification(
        self,
        tenant_id: str,
        ticket_id: str,
        classification: dict,
        confidence_score: float,
    ) -> AuditEvent:
        """Log AI classification decision for compliance."""
        
        return await self.log_action(
            tenant_id=tenant_id,
            user_id=None,  # AI-generated
            action="ai_classification",
            resource_type="ticket",
            resource_id=ticket_id,
            details={
                "classification": classification,
                "confidence_score": confidence_score,
            },
            reason="Automated AI classification for ticket routing",
        )
    
    async def log_auto_reply(
        self,
        tenant_id: str,
        ticket_id: str,
        reply_content: str,
        confidence_score: float,
        was_sent: bool,
    ) -> AuditEvent:
        """Log auto-reply generation/sending."""
        
        return await self.log_action(
            tenant_id=tenant_id,
            user_id=None,  # AI-generated
            action="auto_reply_generated" if not was_sent else "auto_reply_sent",
            resource_type="ticket",
            resource_id=ticket_id,
            details={
                "reply_length": len(reply_content),
                "confidence_score": confidence_score,
                "was_sent": was_sent,
            },
        )
    
    async def log_data_access(
        self,
        tenant_id: str,
        user_id: str,
        resource_type: str,
        resource_id: str,
        fields_accessed: Optional[list[str]] = None,
        ip_address: Optional[str] = None,
    ) -> AuditEvent:
        """Log sensitive data access."""
        
        return await self.log_action(
            tenant_id=tenant_id,
            user_id=user_id,
            action="data_access",
            resource_type=resource_type,
            resource_id=resource_id,
            details={
                "fields_accessed": fields_accessed or [],
            },
            ip_address=ip_address,
            reason="Sensitive data access logged for compliance",
        )
    
    async def log_config_change(
        self,
        tenant_id: str,
        user_id: str,
        config_type: str,
        resource_id: Optional[str],
        previous_state: dict,
        new_state: dict,
        ip_address: Optional[str] = None,
    ) -> AuditEvent:
        """Log configuration changes."""
        
        return await self.log_action(
            tenant_id=tenant_id,
            user_id=user_id,
            action="config_change",
            resource_type=config_type,
            resource_id=resource_id,
            previous_state=previous_state,
            new_state=new_state,
            ip_address=ip_address,
            reason="Configuration change audited for compliance",
        )
    
    async def log_authentication_event(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        email: str,
        event_type: str,  # "login_success", "login_failed", "logout", "password_reset"
        ip_address: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> AuditEvent:
        """Log authentication events."""
        
        return await self.log_action(
            tenant_id=tenant_id,
            user_id=user_id,
            action=event_type,
            resource_type="authentication",
            details={
                "email": email,
            },
            ip_address=ip_address,
            reason=reason or f"Authentication event: {event_type}",
        )


def get_audit_logger(session: AsyncSession) -> AuditLogger:
    """Factory for creating audit logger instances."""
    return AuditLogger(session)
